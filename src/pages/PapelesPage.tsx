/**
 * Papeles (Documents) page — Req 5.1–5.4
 *
 * Views:
 *  1. Folder tiles — 6 icon cards with document counts (Req 5.1)
 *  2. Folder detail — newest-first list with member filter + keyword search (Req 5.2–5.3)
 *  3. Document detail — full photo with tap-to-zoom + all extracted fields (Req 5.4)
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { db, type Document, type DocumentFolder, type Member } from '../db'

// ─── Folder catalogue ─────────────────────────────────────────────────────────

interface FolderDef {
  key: DocumentFolder
  label: string
  emoji: string
}

const FOLDERS: FolderDef[] = [
  { key: 'Eskwela',          label: 'Eskwela',          emoji: '🏫' },
  { key: 'Kalusugan',        label: 'Kalusugan',        emoji: '🏥' },
  { key: 'FDS',              label: 'FDS',              emoji: '👨‍👩‍👧' },
  { key: 'Payout',           label: 'Payout',           emoji: '💰' },
  { key: 'ID at Membership', label: 'ID at Membership', emoji: '🪪' },
  { key: 'Abiso',            label: 'Abiso',            emoji: '📢' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('tl-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function pluralPapel(n: number): string {
  return n === 1 ? '1 papel' : `${n} papel`
}

// ─── Custom hook: live Dexie query ────────────────────────────────────────────
// Re-fetches whenever `fetchFn` reference changes. Callers must wrap in
// useCallback / useMemo to control when that happens.

function useLive<T>(fetchFn: () => Promise<T>, initialValue: T): T {
  const [data, setData] = useState<T>(initialValue)

  useEffect(() => {
    let cancelled = false
    fetchFn().then(result => {
      if (!cancelled) setData(result)
    })
    return () => { cancelled = true }
  }, [fetchFn])

  return data
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

function DocThumbnail({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (!url) {
    return (
      <div
        className="w-14 h-14 rounded-lg bg-border flex-shrink-0"
        aria-hidden="true"
      />
    )
  }
  return (
    <img
      src={url}
      alt={alt}
      className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border"
    />
  )
}

// ─── Document detail view (Req 5.4) ──────────────────────────────────────────

interface DocDetailProps {
  doc: Document
  memberName: string
  onBack: () => void
}

function DocDetailView({ doc, memberName, onBack }: DocDetailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [origin, setOrigin] = useState({ x: 50, y: 50 }) // percent

  // For pinch-to-zoom
  const lastTouchDist = useRef<number | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const url = URL.createObjectURL(doc.imageBlob)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [doc.imageBlob])

  // Reset zoom whenever the document changes
  useEffect(() => {
    setScale(1)
    setOrigin({ x: 50, y: 50 })
  }, [doc.id])

  /** Tap to zoom in at the tapped point, tap again to reset. */
  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if (scale > 1) {
      setScale(1)
      setOrigin({ x: 50, y: 50 })
    } else {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      setOrigin({ x, y })
      setScale(2.5)
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastTouchDist.current = Math.hypot(dx, dy)
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const delta = dist / lastTouchDist.current
      setScale(prev => Math.min(5, Math.max(1, prev * delta)))
      lastTouchDist.current = dist
    }
  }

  function handleTouchEnd() {
    lastTouchDist.current = null
  }

  const zoomed = scale > 1
  const fieldEntries = Object.entries(doc.fields).filter(([, v]) => v)

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Back header */}
      <div className="flex items-center gap-3 px-sobre-md py-3 bg-primary text-white shrink-0">
        <button
          onClick={onBack}
          className="min-h-touch min-w-touch flex items-center justify-center -ml-2"
          aria-label="Bumalik"
        >
          <span className="text-xl" aria-hidden="true">←</span>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sobre-base leading-tight truncate">
            {doc.type || 'Dokumento'}
          </p>
          <p className="text-sobre-label opacity-80 truncate">
            {memberName} · {formatDate(doc.docDate)}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Photo with zoom — Req 5.4 */}
        <div
          className="w-full overflow-hidden bg-black select-none"
          style={{
            maxHeight: '55vh',
            cursor: zoomed ? 'zoom-out' : 'zoom-in',
            touchAction: 'none',
          }}
          onClick={handleTap}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          role="img"
          aria-label={`Larawan ng ${doc.type || 'dokumento'}. ${zoomed ? 'I-tap para lumayo.' : 'I-tap para mag-zoom.'}`}
        >
          {imageUrl ? (
            <img
              ref={imgRef}
              src={imageUrl}
              alt={`${doc.type} - ${memberName}`}
              className="w-full object-contain"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: `${origin.x}% ${origin.y}%`,
                transition:
                  lastTouchDist.current !== null ? 'none' : 'transform 0.2s ease',
                display: 'block',
                maxHeight: '55vh',
              }}
              draggable={false}
            />
          ) : (
            <div className="w-full h-64 flex items-center justify-center">
              <span className="text-white opacity-50 text-sobre-base">Naglo-load…</span>
            </div>
          )}
        </div>

        {zoomed && (
          <p className="text-center text-sobre-min text-text-secondary py-1 bg-background">
            I-tap ulit para lumayo
          </p>
        )}

        {/* Metadata + extracted fields */}
        <div className="p-sobre-md space-y-sobre-sm">
          <div className="sobre-card space-y-2">
            <Row label="Uri" value={doc.type || '—'} />
            <Row label="Miyembro" value={memberName} />
            <Row label="Petsa ng Dokumento" value={formatDate(doc.docDate)} />
            <Row label="Na-save" value={formatDate(doc.createdAt)} />
            <Row label="Folder" value={doc.folder} />
            {doc.corrected && (
              <span className="inline-block badge-ayos text-sobre-min mt-1">
                Nasuri na ✓
              </span>
            )}
          </div>

          {fieldEntries.length > 0 && (
            <div className="sobre-card space-y-2">
              <p className="text-sobre-label font-semibold text-text">Mga Detalye</p>
              {fieldEntries.map(([k, v]) => (
                <Row key={k} label={k} value={v} />
              ))}
            </div>
          )}

          {doc.ocrText && (
            <div className="sobre-card">
              <p className="text-sobre-label font-semibold text-text mb-1">
                Nilalaman (OCR)
              </p>
              <p className="text-sobre-min text-text-secondary whitespace-pre-wrap break-words">
                {doc.ocrText}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-sobre-min text-text-secondary w-32 shrink-0">{label}</span>
      <span className="text-sobre-label text-text flex-1 break-words">{value}</span>
    </div>
  )
}

// ─── Folder detail view (Req 5.2–5.3) ────────────────────────────────────────

interface FolderDetailProps {
  folder: FolderDef
  onBack: () => void
  onOpenDoc: (doc: Document) => void
}

function FolderDetailView({ folder, onBack, onOpenDoc }: FolderDetailProps) {
  const [memberFilter, setMemberFilter] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')

  // Load all documents in this folder, newest first (Req 5.2)
  const fetchDocs = useCallback(
    () =>
      db.documents
        .where('folder')
        .equals(folder.key)
        .reverse()
        .sortBy('createdAt'),
    [folder.key]
  )
  const docs = useLive(fetchDocs, [] as Document[])

  // All members for the filter dropdown (Req 5.3)
  const fetchMembers = useCallback(() => db.members.toArray(), [])
  const members = useLive(fetchMembers, [] as Member[])

  // memberId → name map
  const memberMap = useMemo(() => {
    const m = new Map<number, string>()
    members.forEach(mb => {
      if (mb.id !== undefined) m.set(mb.id, mb.name)
    })
    return m
  }, [members])

  // Apply member filter + keyword search (Req 5.3)
  const filtered = useMemo(() => {
    let list = docs
    if (memberFilter !== 'all') {
      list = list.filter(d => d.memberId === memberFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        d =>
          d.type.toLowerCase().includes(q) ||
          d.ocrText.toLowerCase().includes(q) ||
          Object.values(d.fields).some(v => v.toLowerCase().includes(q)) ||
          (memberMap.get(d.memberId) ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [docs, memberFilter, search, memberMap])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-sobre-md py-3 bg-primary text-white shrink-0">
        <button
          onClick={onBack}
          className="min-h-touch min-w-touch flex items-center justify-center -ml-2"
          aria-label="Bumalik sa mga folder"
        >
          <span className="text-xl" aria-hidden="true">←</span>
        </button>
        <span className="text-2xl" aria-hidden="true">{folder.emoji}</span>
        <h2 className="font-bold text-sobre-base flex-1 truncate">{folder.label}</h2>
        <span className="text-sobre-label opacity-80">{pluralPapel(docs.length)}</span>
      </div>

      {/* Filters — Req 5.3 */}
      <div className="px-sobre-md pt-sobre-sm pb-sobre-sm space-y-sobre-sm bg-card border-b border-border shrink-0">
        {/* Keyword search */}
        <label className="sr-only" htmlFor="papeles-search">Maghanap</label>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary select-none"
            aria-hidden="true"
          >
            🔍
          </span>
          <input
            id="papeles-search"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Maghanap ng papel…"
            className="w-full pl-9 pr-3 py-2 rounded-btn border border-border text-sobre-label bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Member filter dropdown — only shown when there are members */}
        {members.length > 0 && (
          <>
            <label className="sr-only" htmlFor="member-filter">
              I-filter ayon sa miyembro
            </label>
            <select
              id="member-filter"
              value={memberFilter === 'all' ? 'all' : memberFilter}
              onChange={e =>
                setMemberFilter(
                  e.target.value === 'all' ? 'all' : Number(e.target.value)
                )
              }
              className="w-full px-3 py-2 rounded-btn border border-border text-sobre-label bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Lahat ng miyembro</option>
              {members.map(mb => (
                <option key={mb.id} value={mb.id}>
                  {mb.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Document list (Req 5.2) */}
      <div
        className="flex-1 overflow-y-auto px-sobre-md py-sobre-sm space-y-sobre-sm"
        role="list"
        aria-label={`Mga papel sa ${folder.label}`}
      >
        {filtered.length === 0 ? (
          <div className="sobre-card text-center text-text-secondary text-sobre-base mt-sobre-md">
            {docs.length === 0
              ? 'Walang papel sa folder na ito.'
              : 'Walang nahanap. Baguhin ang search o filter.'}
          </div>
        ) : (
          filtered.map(doc => (
            <div key={doc.id} role="listitem">
              <button
                className="sobre-card w-full text-left flex gap-3 items-start active:bg-gray-50 transition-colors"
                onClick={() => onOpenDoc(doc)}
                aria-label={`Buksan: ${doc.type || 'Dokumento'}, ${memberMap.get(doc.memberId) ?? ''}, ${formatDate(doc.docDate)}`}
              >
                {/* Thumbnail */}
                <DocThumbnail
                  blob={doc.imageBlob}
                  alt={doc.type || 'Dokumento'}
                />

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sobre-label text-text truncate">
                    {doc.type || 'Dokumento'}
                  </p>
                  <p className="text-sobre-min text-text-secondary">
                    {memberMap.get(doc.memberId) ?? 'Hindi kilala'}
                  </p>
                  <p className="text-sobre-min text-text-secondary">
                    {formatDate(doc.docDate)}
                  </p>
                  {doc.corrected && (
                    <span className="badge-ayos text-[11px] mt-1 inline-block">
                      Nasuri ✓
                    </span>
                  )}
                </div>

                {/* Chevron */}
                <span
                  className="text-text-secondary text-sobre-base self-center shrink-0"
                  aria-hidden="true"
                >
                  ›
                </span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Folder tile (Req 5.1) ────────────────────────────────────────────────────

interface FolderTileProps {
  folder: FolderDef
  count: number
  onClick: () => void
}

function FolderTile({ folder, count, onClick }: FolderTileProps) {
  return (
    <button
      onClick={onClick}
      className="sobre-card flex flex-col items-center justify-center gap-2 min-h-touch active:bg-gray-50 transition-colors py-5 w-full"
      aria-label={`${folder.label}, ${pluralPapel(count)}`}
    >
      <span className="text-4xl leading-none" aria-hidden="true">
        {folder.emoji}
      </span>
      <span className="text-sobre-label font-semibold text-text text-center leading-tight">
        {folder.label}
      </span>
      <span className="text-sobre-min text-text-secondary">
        {pluralPapel(count)}
      </span>
    </button>
  )
}

// ─── Main page component ──────────────────────────────────────────────────────

type View =
  | { kind: 'folders' }
  | { kind: 'detail'; folder: FolderDef }
  | { kind: 'doc'; doc: Document; folderDef: FolderDef }

export default function PapelesPage() {
  const [view, setView] = useState<View>({ kind: 'folders' })

  // Per-folder document counts for the tile grid (Req 5.1)
  const fetchCounts = useCallback(async () => {
    const all = await db.documents.toArray()
    const map: Partial<Record<DocumentFolder, number>> = {}
    for (const doc of all) {
      map[doc.folder] = (map[doc.folder] ?? 0) + 1
    }
    return map
  }, [])
  const counts = useLive(fetchCounts, {} as Partial<Record<DocumentFolder, number>>)

  // Members for the doc-detail name lookup (cached at this level)
  const fetchMembers = useCallback(() => db.members.toArray(), [])
  const members = useLive(fetchMembers, [] as Member[])
  const memberMap = useMemo(() => {
    const m = new Map<number, string>()
    members.forEach(mb => {
      if (mb.id !== undefined) m.set(mb.id, mb.name)
    })
    return m
  }, [members])

  // ── Document detail view ───────────────────────────────────────────────────
  if (view.kind === 'doc') {
    return (
      <DocDetailView
        doc={view.doc}
        memberName={memberMap.get(view.doc.memberId) ?? 'Hindi kilala'}
        onBack={() => setView({ kind: 'detail', folder: view.folderDef })}
      />
    )
  }

  // ── Folder detail view ─────────────────────────────────────────────────────
  if (view.kind === 'detail') {
    return (
      <FolderDetailView
        folder={view.folder}
        onBack={() => setView({ kind: 'folders' })}
        onOpenDoc={doc => setView({ kind: 'doc', doc, folderDef: view.folder })}
      />
    )
  }

  // ── Default: folder tile grid (Req 5.1) ───────────────────────────────────
  return (
    <main className="flex-1 overflow-y-auto px-sobre-md py-sobre-md">
      <h1 className="text-sobre-title font-bold text-text mb-sobre-md">Papeles</h1>
      <div
        className="grid grid-cols-2 gap-sobre-sm"
        role="list"
        aria-label="Mga folder ng dokumento"
      >
        {FOLDERS.map(folder => (
          <div key={folder.key} role="listitem">
            <FolderTile
              folder={folder}
              count={counts[folder.key] ?? 0}
              onClick={() => setView({ kind: 'detail', folder })}
            />
          </div>
        ))}
      </div>
    </main>
  )
}
