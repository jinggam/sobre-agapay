/**
 * POST /api/read
 *
 * Accepts a multipart upload (image or PDF).
 * 1. Sends the file buffer to Lumen OCR to extract text.
 * 2. Sends the OCR text to Lumen AI Chat to get structured JSON fields.
 * 3. Returns { text, fields, confidence } to the client.
 *
 * The file is never written to disk (Req 9.2). multer uses memoryStorage().
 */

import { Router } from 'express';
import multer from 'multer';

/** Maximum upload size: 20 MB (images + PDFs, in-memory) */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Allowed MIME types */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * System prompt sent to Lumen AI Chat for JSON extraction.
 * Returns ONLY the JSON object — no extra text.
 */
const EXTRACT_SYSTEM_PROMPT = `You are a document classifier for 4Ps (Pantawid Pamilyang Pilipino Program) documents.
Given OCR text from a scanned document, extract structured information and return ONLY a valid JSON object — no prose, no markdown fences.

The JSON must have exactly this shape:
{
  "type": "<document type string>",
  "folder": "<one of: Eskwela | Kalusugan | FDS | Payout | ID at Membership | Abiso>",
  "memberName": "<full name of family member mentioned, or null>",
  "docDate": "<ISO 8601 date string YYYY-MM-DD, or null>",
  "keyFields": {
    "<field_key>": "<field_value>"
  },
  "confidence": {
    "type": <0.0–1.0>,
    "folder": <0.0–1.0>,
    "memberName": <0.0–1.0>,
    "docDate": <0.0–1.0>
  }
}

Rules:
- folder must be one of the six exact values listed above.
- If a field cannot be determined, set it to null.
- confidence values below 0.6 indicate the field is "Hindi sigurado" (unsure).
- keyFields should include relevant details like amount, due date, venue, school name, etc.
- Return ONLY the JSON object. No extra text.`;

/**
 * Call Lumen OCR API with the uploaded file buffer.
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @returns {Promise<string>} Extracted OCR text
 */
async function callLumenOCR(fileBuffer, mimeType) {
  const ocrUrl = process.env.LUMEN_OCR_API_URL;
  const ocrKey = process.env.LUMEN_OCR_API_KEY;

  if (!ocrUrl || !ocrKey) {
    throw new Error('Lumen OCR is not configured. Set LUMEN_OCR_API_URL and LUMEN_OCR_API_KEY.');
  }

  // Send the raw file as multipart/form-data to the OCR endpoint
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('file', blob, 'document');

  const response = await fetch(ocrUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ocrKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Lumen OCR error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  // Lumen OCR is expected to return { text: "..." } or similar.
  // Adjust the property path if the actual API shape differs.
  const text = data?.text ?? data?.result ?? data?.content ?? '';
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Lumen OCR returned no text. The image may be unreadable.');
  }

  return text;
}

/**
 * Call Lumen AI Chat to extract structured fields from OCR text.
 * @param {string} ocrText
 * @returns {Promise<{ fields: object, confidence: object }>}
 */
async function callLumenChat(ocrText) {
  const chatUrl = process.env.LUMEN_CHAT_API_URL;
  const chatKey = process.env.LUMEN_CHAT_API_KEY;

  if (!chatUrl || !chatKey) {
    throw new Error(
      'Lumen AI Chat is not configured. Set LUMEN_CHAT_API_URL and LUMEN_CHAT_API_KEY.',
    );
  }

  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chatKey}`,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `OCR TEXT:\n${ocrText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Lumen AI Chat error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  // Extract the assistant's reply text from common response shapes
  const rawContent =
    data?.choices?.[0]?.message?.content ?? // OpenAI-compatible
    data?.content ?? // flat
    data?.response ?? // some providers
    data?.text ?? '';

  if (!rawContent) {
    throw new Error('Lumen AI Chat returned an empty response.');
  }

  // Parse JSON — the prompt instructs the model to return only JSON
  let parsed;
  try {
    // Strip any accidental markdown fences before parsing
    const cleaned = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Lumen AI Chat did not return valid JSON. Raw response: ${rawContent.slice(0, 200)}`,
    );
  }

  const { type, folder, memberName, docDate, keyFields = {}, confidence = {} } = parsed;

  return {
    fields: { type, folder, memberName, docDate, keyFields },
    confidence,
  };
}

export const readRouter = Router();

readRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send a file in the "file" field.' });
    }

    const { buffer, mimetype } = req.file;

    // Step 1: OCR
    let ocrText;
    try {
      ocrText = await callLumenOCR(buffer, mimetype);
    } catch (err) {
      return res.status(502).json({
        error: 'OCR failed',
        message: err?.message ?? 'Could not read the document.',
      });
    }

    // Step 2: AI field extraction
    let extracted;
    try {
      extracted = await callLumenChat(ocrText);
    } catch (err) {
      return res.status(502).json({
        error: 'Field extraction failed',
        message: err?.message ?? 'Could not identify document fields.',
      });
    }

    // Return combined result — file buffer is never stored
    return res.json({
      text: ocrText,
      fields: extracted.fields,
      confidence: extracted.confidence,
    });
  } catch (err) {
    return next(err);
  }
});
