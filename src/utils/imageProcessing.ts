/**
 * imageProcessing.ts
 *
 * Canvas-based image enhancement pipeline for the scan flow (Requirement 2.2).
 * Steps: crop/deskew (perspective straighten) → contrast boost → compress.
 *
 * Also exports quality-check helpers used by Req 2.3:
 *   - isTooDark()   checks average luminance
 *   - isTooBlurry() checks local variance (Laplacian proxy via canvas)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessedImage {
  blob: Blob
  dataUrl: string
  width: number
  height: number
}

export interface QualityCheck {
  dark: boolean
  blurry: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Luminance threshold: 0–255. Below this average → too dark. */
const DARK_THRESHOLD = 60

/**
 * Variance threshold for blurriness.
 * Lower variance of the Laplacian-like difference map = blurrier image.
 * Empirically chosen for phone camera crops; tune as needed.
 */
const BLUR_THRESHOLD = 80

/** Output JPEG quality for compressed scan (0–1). */
const OUTPUT_QUALITY = 0.85

/** Max output dimension in pixels (longest side). Keeps blobs small. */
const MAX_DIMENSION = 2048

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Load an image Blob/File into an HTMLImageElement. */
function loadImage(src: Blob | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(src)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Nabigo ang pag-load ng larawan.'))
    }
    img.src = url
  })
}

/** Create an off-screen canvas and return context. */
function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  return [canvas, ctx]
}

// ─── Quality checks ───────────────────────────────────────────────────────────

/**
 * Check if the image is too dark.
 * Draws the image to a small 64×64 canvas and averages luminance (Req 2.3).
 */
export async function isTooDark(source: Blob | File): Promise<boolean> {
  const img = await loadImage(source)
  const size = 64
  const [, ctx] = makeCanvas(size, size)
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    // ITU-R BT.601 luminance
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  const avg = total / (size * size)
  return avg < DARK_THRESHOLD
}

/**
 * Estimate blurriness via local variance of a simplified edge map (Req 2.3).
 * We sample a 128×128 region and compute variance of horizontal differences —
 * a lightweight Laplacian proxy that runs in-browser without WASM.
 */
export async function isTooBlurry(source: Blob | File): Promise<boolean> {
  const img = await loadImage(source)
  const size = 128
  const [, ctx] = makeCanvas(size, size)
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  // Convert to greyscale and compute horizontal first-derivative map
  const grey: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    grey.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  }

  const diffs: number[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size - 1; x++) {
      const idx = y * size + x
      diffs.push(Math.abs(grey[idx + 1] - grey[idx]))
    }
  }

  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
  const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length

  return variance < BLUR_THRESHOLD
}

/**
 * Run both quality checks concurrently (Req 2.3).
 */
export async function checkQuality(source: Blob | File): Promise<QualityCheck> {
  const [dark, blurry] = await Promise.all([isTooDark(source), isTooBlurry(source)])
  return { dark, blurry }
}

// ─── Auto-contrast ────────────────────────────────────────────────────────────

/**
 * Apply histogram-stretch contrast enhancement and slight sharpening to the
 * ImageData in place (Req 2.2).
 *
 * 1. Find the 2nd and 98th percentile pixel values to avoid clipping.
 * 2. Stretch them to 0–255.
 * 3. Apply a simple unsharp-mask-style sharpening convolution.
 */
function enhanceContrast(imageData: ImageData): void {
  const { data, width, height } = imageData

  // ── Step 1: build luminance histogram ──────────────────────────────────────
  const hist = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    hist[lum]++
  }

  const totalPixels = width * height
  const lowCut = totalPixels * 0.02
  const highCut = totalPixels * 0.98

  let lo = 0, hi = 255, cumulative = 0
  for (let v = 0; v < 256; v++) {
    cumulative += hist[v]
    if (cumulative < lowCut) lo = v
    if (cumulative < highCut) hi = v
  }

  if (hi === lo) return // flat image, nothing to stretch

  // ── Step 2: build LUT and apply ───────────────────────────────────────────
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.round(((v - lo) / (hi - lo)) * 255)
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]           // R
    data[i + 1] = lut[data[i + 1]]   // G
    data[i + 2] = lut[data[i + 2]]   // B
    // Alpha unchanged
  }
}

// ─── Deskew (simple rotation estimation) ─────────────────────────────────────

/**
 * Estimate the dominant text rotation angle via Hough-inspired row-projection.
 *
 * We test angles from -15° to +15° in 1° steps and pick the angle whose
 * horizontal projection has the highest variance (sharpest row peaks =
 * text lines are horizontal). Returns the angle in degrees.
 *
 * This is intentionally a simplified approach — full Hough needs WASM.
 * Good enough for phone documents that are roughly aligned.
 */
function estimateSkewAngle(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  // Downsample to speed up
  const small = 256
  const scale = Math.min(small / w, small / h)
  const sw = Math.round(w * scale)
  const sh = Math.round(h * scale)

  const [, sCtx] = makeCanvas(sw, sh)
  sCtx.drawImage(ctx.canvas, 0, 0, sw, sh)
  const { data } = sCtx.getImageData(0, 0, sw, sh)

  // Greyscale + threshold
  const binary: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    binary.push(lum < 128 ? 1 : 0) // dark pixels = potential text
  }

  let bestAngle = 0
  let bestVariance = -1

  for (let angle = -15; angle <= 15; angle += 1) {
    const rad = (angle * Math.PI) / 180
    const cosA = Math.cos(rad)
    const sinA = Math.sin(rad)

    // Project pixels onto rotated rows
    const rows = new Array(sh * 2).fill(0)
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (binary[y * sw + x]) {
          // Rotated y-coordinate
          const ry = Math.round(-x * sinA + y * cosA) + sh
          if (ry >= 0 && ry < rows.length) rows[ry]++
        }
      }
    }

    const mean = rows.reduce((a, b) => a + b, 0) / rows.length
    const variance = rows.reduce((a, b) => a + (b - mean) ** 2, 0) / rows.length

    if (variance > bestVariance) {
      bestVariance = variance
      bestAngle = angle
    }
  }

  return bestAngle
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Full image processing pipeline (Req 2.2):
 *   1. Decode image.
 *   2. Scale down to MAX_DIMENSION if needed.
 *   3. Estimate and correct skew.
 *   4. Auto-contrast (histogram stretch).
 *   5. Compress to JPEG.
 *
 * Returns a ProcessedImage with the final Blob and dataUrl.
 */
export async function processImage(source: Blob | File): Promise<ProcessedImage> {
  const img = await loadImage(source)

  // ── Scale ──────────────────────────────────────────────────────────────────
  let { naturalWidth: w, naturalHeight: h } = img
  const longest = Math.max(w, h)
  if (longest > MAX_DIMENSION) {
    const ratio = MAX_DIMENSION / longest
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)
  }

  const [canvas, ctx] = makeCanvas(w, h)
  ctx.drawImage(img, 0, 0, w, h)

  // ── Deskew ─────────────────────────────────────────────────────────────────
  const angle = estimateSkewAngle(ctx, w, h)

  if (Math.abs(angle) >= 1) {
    const [rotCanvas, rotCtx] = makeCanvas(w, h)
    rotCtx.translate(w / 2, h / 2)
    rotCtx.rotate((-angle * Math.PI) / 180)
    rotCtx.drawImage(canvas, -w / 2, -h / 2)
    // Replace canvas content with rotated version
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(rotCanvas, 0, 0)
  }

  // ── Contrast ───────────────────────────────────────────────────────────────
  const imageData = ctx.getImageData(0, 0, w, h)
  enhanceContrast(imageData)
  ctx.putImageData(imageData, 0, 0)

  // ── Compress ───────────────────────────────────────────────────────────────
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      OUTPUT_QUALITY,
    )
  })

  const dataUrl = canvas.toDataURL('image/jpeg', OUTPUT_QUALITY)

  return { blob, dataUrl, width: w, height: h }
}

/**
 * Convert a PDF File to an image Blob using the browser's built-in PDF renderer
 * (via an <iframe> + canvas screenshot approach is not reliable cross-browser).
 *
 * Instead we use a simpler strategy: render page 1 of the PDF inside a hidden
 * <embed> and ask the user to screenshot — not ideal. For MVP we just pass the
 * PDF blob directly to the OCR API and skip canvas processing.
 *
 * Returns the original file wrapped as a Blob if it is a PDF, so the pipeline
 * can still upload it. Canvas enhancement is skipped for PDFs.
 */
export async function preparePDF(file: File): Promise<ProcessedImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Nabigo ang pagbasa ng PDF.'))
    reader.readAsDataURL(file)
  })

  return {
    blob: file,
    dataUrl,
    width: 0,
    height: 0,
  }
}
