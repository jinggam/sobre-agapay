/**
 * CheckCorrectPage — Check-and-correct screen (Requirements 3.3–3.4, 4.1–4.3).
 *
 * Flow:
 *  1. On mount: POST the scanned blob to /api/read → get OCR text + extracted fields.
 *  2. Display the photo alongside each field; low-confidence fields are highlighted
 *     "Hindi sigurado" in yellow (Req 3.4).
 *  3. The user may tap "Ayusin" on any field to inline-edit its value (Req 4.1–4.2).
 *  4. The user picks a folder and assigns the doc to a member (Req 3.3, 4.3).
 *  5. On "Tama, I-save": store Document in Dexie; if a future date was found,
 *     offer to create an Event + Reminder (Req 4.3, 7.1).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type DocumentFolder, type Member, type Event, type Reminder } from '../db'
import { type ScanResult } from './ScanPage'

// ─── Constants ─────────────────────────────────────────────────────────────────

const FOLDERS: DocumentFolder[] = [
  'Eskwela',
  'Kalusugan',
  'FDS',
  'Payout',
  'ID at Membership',
  'Abiso',
]

const FOLDER_ICONS: Record<DocumentFolder, string> = {
  Eskwela: '🏫',
  Kalusugan: '🏥',
  FDS: '👨‍👩‍👧',
  Payout: '💰',
  'ID at Membership': '🪪',
  Abiso: '📢',
}

/** Confidence threshold below which a field is flagged "Hindi sigurado". */
const UNSURE_THRESHOLD = 0.6

const EVENT_KINDS = ['fds', 'checkup', 'deworming', 'prenatal', 'payout', 'other'] as const

// ─── Tagalog strings ────────────────────────────────────────────────────────────

const T = {
  title: 'Suriin ang Papel',
  loadingOcr: 'Binabasa ang papel…',
  errorRetry: 'I-scan Ulit',
  errorCancel: 'Kanselahin',
  ocrFailed: 'Hindi nabasa ang papel.',
  ocrFailedTip: 'Siguraduhing maliwanag at matalas ang larawan, at subukang muli.',
  photoAlt: 'Larawan ng papel',
  pdfLabel: 'PDF na dokumento',
  hindiSigurado: 'Hindi sigurado',
  ayusin: 'Ayusin',
  tapos: 'Tapos',
  fieldType: 'Uri ng Dokumento',
  fieldMember: 'Miyembro ng Pamilya',
  fieldDate: 'Petsa ng Dokumento',
  folder: 'Folder',
  chooseFolder: 'Pumili ng folder…',
  chooseMember: 'Pumili ng miyembro…',
  walangMiyembro: 'Walang miyembro',
  saveBtn: 'Tama, I-save',
  saving: 'Sine-save…',
  cancelBtn: 'Bumalik',
  savedOk: 'Na-save na ang papel!',
  savedError: 'Hindi na-save. Subukang muli.',
  eventOfferTitle: 'May Petsa sa Hinaharap',
  eventOfferMsg: (date: string) =>
    `Makikita ang petsa na ${date} sa papel na ito. Gusto mo bang gumawa ng paalala?`,
  eventKindLabel: 'Uri ng Event',
  createEventBtn: 'Gumawa ng Paalala',
  skipEventBtn: 'Presto, laktawan',
  eventKindMap: {
    fds: 'FDS',
    checkup: 'Check-up',
    deworming: 'Deworming',
    prenatal: 'Prenatal',
    payout: 'Payout',
    other: 'Iba pa',
  } as Record<string, string>,
}

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ApiReadResponse {
  text: string
  fields: {
    type: string | null
    folder: string | null
    memberName: string | null
    docDate: string | null
    keyFields: Record<string, string>
  }
  confidence: {
    type?: number
    folder?: number
    memberName?: number
    docDate?: number
    [key: string]: number | undefined
  }
}

/** A single editable field row shown on the confirm screen. */
interface FieldRow {
  key: string
  label: string
  value: string
  confidence: number
  edited: boolean
}

// ─── Props ──────────────────────────────────────────────────────────────────────

interface CheckCorrectPageProps {
  scanResult: ScanResult
  onSaved: (docId: number) => void
  onCancel: () => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Make a human-readable label from a camelCase or snake_case key. */
function prettifyKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

/** Fuzzy-match an AI-returned name against the member list (simple includes). */
function matchMember(name: string | null, members: Member[]): Member | undefined {
  if (!name) return undefined
  const lower = name.toLowerCase()
  return members.find((m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase()))
}

/** Return true if a date string represents a future date. */
function isFutureDate(dateStr: string | null): boolean {
  if (!dateStr) return false
  try {
    const d = new Date(dateStr)
    return !isNaN(d.getTime()) && d > new Date()
  } catch {
    return false
  }
}

/** Format a date string to a readable Filipino/English format. */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fil-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ─── Shared button components ────────────────────────────────────────────────────

function PrimaryButton({
  onClick,
  disabled,
  children,
  className = '',
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full min-h-touch flex items-center justify-center gap-2',
        'rounded-btn bg-action text-text font-bold text-sobre-base',
        'active:opacity-80 disabled:opacity-40 transition-opacity',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function OutlineButton({
  onClick,
  disabled,
  children,
  className = '',
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full min-h-touch flex items-center justify-center gap-2',
        'rounded-btn border border-primary text-primary font-bold text-sobre-base',
        'active:bg-primary/10 disabled:opacity-40 transition-colors',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── Inline field editor ─────────────────────────────────────────────────────────

interface FieldEditorProps {
  row: FieldRow
  onSave: (key: string, value: string) => void
}

function FieldEditor({ row, onSave }: FieldEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.value)
  const inputRef = useRef<HTMLInputElement>(null)

  const isUnsure = row.confidence < UNSURE_THRESHOLD && !row.edited

  const handleEditClick = () => {
    setDraft(row.value)
    setEditing(true)
    // Focus after render
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleSave = () => {
    onSave(row.key, draft.trim())
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <div
      className={[
        'rounded-card p-sobre-md border transition-colors',
        isUnsure
          ? 'bg-status-malapit-bg border-status-malapit-text/30'
          : 'bg-card border-border',
      ].join(' ')}
    >
      {/* Label row */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sobre-label font-semibold text-text-secondary">
          {row.label}
        </span>
        {isUnsure && (
          <span className="flex items-center gap-1 text-sobre-min font-semibold text-status-malapit-text bg-status-malapit-bg px-2 py-0.5 rounded-full border border-status-malapit-text/30 shrink-0">
            ⚠ {T.hindiSigurado}
          </span>
        )}
        {row.edited && (
          <span className="text-sobre-min text-status-ayos-text bg-status-ayos-bg px-2 py-0.5 rounded-full shrink-0">
            ✓ Binago
          </span>
        )}
      </div>

      {/* Value / editor */}
      {editing ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className={[
              'flex-1 min-h-touch rounded-btn border px-3 text-sobre-base text-text',
              'border-primary focus:outline-none focus:ring-2 focus:ring-primary/40',
            ].join(' ')}
            aria-label={`I-edit ang ${row.label}`}
          />
          <button
            onClick={handleSave}
            className="min-h-touch px-4 rounded-btn bg-primary text-white font-bold text-sobre-label active:opacity-80 transition-opacity shrink-0"
          >
            {T.tapos}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 mt-1">
          <span className={[
            'text-sobre-base break-words min-w-0',
            row.value ? 'text-text' : 'text-text-secondary italic',
          ].join(' ')}>
            {row.value || '—'}
          </span>
          {/* Ayusin button (Req 4.1) */}
          <button
            onClick={handleEditClick}
            className={[
              'shrink-0 min-h-[40px] px-3 rounded-btn text-sobre-label font-semibold',
              'border border-primary text-primary active:bg-primary/10 transition-colors',
            ].join(' ')}
            aria-label={`Ayusin ang ${row.label}`}
          >
            ✏ {T.ayusin}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Event/Reminder offer modal ───────────────────────────────────────────────────

interface EventOfferProps {
  futureDate: string
  memberId: number
  sourceDocId: number
  onDone: () => void
}

function EventOffer({ futureDate, memberId, sourceDocId, onDone }: EventOfferProps) {
  const [kind, setKind] = useState<typeof EVENT_KINDS[number]>('other')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    setSaving(true)
    try {
      const eventId = await db.events.add({
        memberId,
        kind,
        date: new Date(futureDate),
        done: false,
        sourceDocId,
      } as Event)

      // Default reminders: 3 days before + morning of event (Req 7.2)
      const eventDate = new Date(futureDate)
      const threeDaysBefore = new Date(eventDate)
      threeDaysBefore.setDate(threeDaysBefore.getDate() - 3)
      threeDaysBefore.setHours(8, 0, 0, 0)

      const morningOf = new Date(eventDate)
      morningOf.setHours(8, 0, 0, 0)

      // Default "what to bring" list by kind (Req 7.4)
      const bringMap: Record<string, string[]> = {
        fds: ['4Ps ID', 'Notebook'],
        checkup: ['Health card', '4Ps ID'],
        deworming: ['4Ps ID'],
        prenatal: ['Maternal card', '4Ps ID'],
        payout: ['4Ps ID', 'Cash card'],
        other: ['4Ps ID'],
      }

      await db.reminders.add({
        eventId: eventId as number,
        remindAt: [threeDaysBefore.toISOString(), morningOf.toISOString()],
        bringList: bringMap[kind] ?? ['4Ps ID'],
      } as Reminder)
    } catch (e) {
      console.error('Failed to create event/reminder:', e)
    } finally {
      setSaving(false)
      onDone()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" role="dialog" aria-modal="true">
      <div className="w-full bg-card rounded-t-[20px] px-sobre-md pt-6 pb-10 shadow-xl">
        {/* Handle */}
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" aria-hidden="true" />

        {/* Title */}
        <h2 className="text-sobre-title font-bold text-text mb-2">
          {T.eventOfferTitle}
        </h2>
        <p className="text-sobre-base text-text-secondary mb-sobre-md">
          {T.eventOfferMsg(formatDate(futureDate))}
        </p>

        {/* Kind picker */}
        <label className="block text-sobre-label font-semibold text-text mb-1">
          {T.eventKindLabel}
        </label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof EVENT_KINDS[number])}
          className="w-full min-h-touch rounded-btn border border-border px-3 text-sobre-base text-text bg-background mb-sobre-md"
        >
          {EVENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {T.eventKindMap[k]}
            </option>
          ))}
        </select>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <PrimaryButton onClick={handleCreate} disabled={saving}>
            🔔 {saving ? T.saving : T.createEventBtn}
          </PrimaryButton>
          <OutlineButton onClick={onDone} disabled={saving}>
            {T.skipEventBtn}
          </OutlineButton>
        </div>
      </div>
    </div>
  )
}

// ─── Main CheckCorrectPage ─────────────────────────────────────────────────────────

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'form' }
  | { kind: 'saving' }
  | { kind: 'eventOffer'; docId: number; futureDate: string; memberId: number }
  | { kind: 'done' }

export default function CheckCorrectPage({ scanResult, onSaved, onCancel }: CheckCorrectPageProps) {
  const [pageState, setPageState] = useState<PageState>({ kind: 'loading' })

  // Extracted from API
  const [ocrText, setOcrText] = useState('')
  const [fields, setFields] = useState<FieldRow[]>([])
  const [folder, setFolder] = useState<DocumentFolder>('Abiso')
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [anyEdited, setAnyEdited] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Load members from DB ──────────────────────────────────────────────────

  useEffect(() => {
    db.members.toArray().then(setMembers).catch(console.error)
  }, [])

  // ── Call /api/read on mount ───────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function fetchOcr() {
      try {
        const formData = new FormData()
        formData.append('file', scanResult.blob, scanResult.isPDF ? 'document.pdf' : 'document.jpg')

        const res = await fetch('/api/read', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: T.ocrFailed }))
          throw new Error(err?.message ?? T.ocrFailed)
        }

        const data: ApiReadResponse = await res.json()
        if (cancelled) return

        setOcrText(data.text)

        // Build field rows from the API response
        const rows: FieldRow[] = []

        const addRow = (key: string, label: string, value: string | null, conf?: number) => {
          rows.push({
            key,
            label,
            value: value ?? '',
            confidence: conf ?? 1,
            edited: false,
          })
        }

        addRow('type', T.fieldType, data.fields.type, data.confidence.type)
        addRow('docDate', T.fieldDate, data.fields.docDate, data.confidence.docDate)
        addRow('memberName', T.fieldMember, data.fields.memberName, data.confidence.memberName)

        // Key fields from AI
        for (const [k, v] of Object.entries(data.fields.keyFields ?? {})) {
          addRow(k, prettifyKey(k), v, 1) // keyFields don't have per-key confidence; default to sure
        }

        setFields(rows)

        // Auto-set folder from AI suggestion
        const suggestedFolder = data.fields.folder
        if (suggestedFolder && FOLDERS.includes(suggestedFolder as DocumentFolder)) {
          setFolder(suggestedFolder as DocumentFolder)
        }

        // Auto-match member
        const membersFromDB = await db.members.toArray()
        setMembers(membersFromDB)
        const matched = matchMember(data.fields.memberName, membersFromDB)
        if (matched?.id != null) {
          setSelectedMemberId(matched.id)
        }

        setPageState({ kind: 'form' })
      } catch (err: unknown) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : T.ocrFailed
        setPageState({ kind: 'error', message: msg })
      }
    }

    fetchOcr()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Field edit handler ────────────────────────────────────────────────────

  const handleFieldSave = useCallback((key: string, newValue: string) => {
    setFields((prev) =>
      prev.map((f) =>
        f.key === key ? { ...f, value: newValue, edited: true } : f,
      ),
    )
    setAnyEdited(true)
  }, [])

  // ── Save document ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveError('')
    setPageState({ kind: 'saving' })

    try {
      const memberId = selectedMemberId ?? (members[0]?.id ?? 0)

      // Build fields map
      const keyFields: Record<string, string> = {}
      for (const f of fields) {
        if (!['type', 'docDate', 'memberName'].includes(f.key)) {
          keyFields[f.key] = f.value
        }
      }

      const typeField = fields.find((f) => f.key === 'type')?.value ?? ''
      const docDateStr = fields.find((f) => f.key === 'docDate')?.value ?? ''
      let docDate: Date
      try {
        const parsed = new Date(docDateStr)
        docDate = isNaN(parsed.getTime()) ? new Date() : parsed
      } catch {
        docDate = new Date()
      }

      const docId = await db.documents.add({
        memberId,
        folder,
        type: typeField,
        docDate,
        fields: keyFields,
        ocrText,
        imageBlob: scanResult.blob,
        corrected: anyEdited,
        createdAt: new Date(),
      })

      // Check for future date to offer an event (Req 7.1)
      if (isFutureDate(docDateStr)) {
        setPageState({ kind: 'eventOffer', docId: docId as number, futureDate: docDateStr, memberId })
      } else {
        // Also check key fields for future dates
        const futureDateField = Object.values(keyFields).find(isFutureDate)
        if (futureDateField) {
          setPageState({ kind: 'eventOffer', docId: docId as number, futureDate: futureDateField, memberId })
        } else {
          setPageState({ kind: 'done' })
          onSaved(docId as number)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : T.savedError
      setSaveError(msg)
      setPageState({ kind: 'form' })
    }
  }

  // ─── Render: Loading ──────────────────────────────────────────────────────

  if (pageState.kind === 'loading') {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="px-sobre-md pt-sobre-md pb-2 shrink-0 flex items-center gap-3">
          <button
            onClick={onCancel}
            aria-label="Bumalik"
            className="min-h-touch min-w-touch flex items-center justify-center rounded-full text-primary text-sobre-title active:bg-primary/10 transition-colors -ml-2"
          >
            ←
          </button>
          <h1 className="text-sobre-title font-bold text-text">{T.title}</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-sobre-md">
          <div
            className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"
            aria-hidden="true"
          />
          <p className="text-sobre-base text-text-secondary text-center">
            {T.loadingOcr}
          </p>
        </div>
      </div>
    )
  }

  // ─── Render: Error ────────────────────────────────────────────────────────

  if (pageState.kind === 'error') {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="px-sobre-md pt-sobre-md pb-2 shrink-0 flex items-center gap-3">
          <button
            onClick={onCancel}
            aria-label="Bumalik"
            className="min-h-touch min-w-touch flex items-center justify-center rounded-full text-primary text-sobre-title active:bg-primary/10 transition-colors -ml-2"
          >
            ←
          </button>
          <h1 className="text-sobre-title font-bold text-text">{T.title}</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-sobre-md">
          <span className="text-6xl" aria-hidden="true">📄</span>
          <div className="bg-status-kulang-bg border border-status-kulang-text/20 rounded-card p-sobre-md w-full">
            <p className="text-sobre-base text-status-kulang-text font-semibold mb-1">
              {T.ocrFailed}
            </p>
            <p className="text-sobre-label text-status-kulang-text">
              {pageState.message}
            </p>
            <p className="text-sobre-label text-text-secondary mt-2">
              {T.ocrFailedTip}
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <PrimaryButton onClick={onCancel}>{T.errorCancel}</PrimaryButton>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: Saving spinner ───────────────────────────────────────────────

  if (pageState.kind === 'saving') {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center gap-6">
        <div
          className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"
          aria-hidden="true"
        />
        <p className="text-sobre-base text-text-secondary">{T.saving}</p>
      </div>
    )
  }

  // ─── Render: Event offer modal ────────────────────────────────────────────

  if (pageState.kind === 'eventOffer') {
    const { docId, futureDate, memberId } = pageState
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Background fill while modal shows */}
        <div className="flex-1 flex items-center justify-center">
          <span className="text-6xl" aria-hidden="true">✅</span>
        </div>
        <EventOffer
          futureDate={futureDate}
          memberId={memberId}
          sourceDocId={docId}
          onDone={() => {
            setPageState({ kind: 'done' })
            onSaved(docId)
          }}
        />
      </div>
    )
  }

  // ─── Render: Done (brief — parent will unmount us via onSaved) ────────────

  if (pageState.kind === 'done') {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center gap-4 px-sobre-md">
        <span className="text-7xl" aria-hidden="true">✅</span>
        <p className="text-sobre-title font-bold text-text text-center">{T.savedOk}</p>
      </div>
    )
  }

  // ─── Render: Form ─────────────────────────────────────────────────────────

  // pageState.kind === 'form' here (all other cases return above)
  const memberName = members.find((m) => m.id === selectedMemberId)?.name

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-sobre-md pt-sobre-md pb-2 shrink-0 flex items-center gap-3">
        <button
          onClick={onCancel}
          aria-label="Bumalik"
          className="min-h-touch min-w-touch flex items-center justify-center rounded-full text-primary text-sobre-title active:bg-primary/10 transition-colors -ml-2"
        >
          ←
        </button>
        <h1 className="text-sobre-title font-bold text-text">{T.title}</h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-sobre-md pb-sobre-md">

        {/* ── Photo preview ─────────────────────────────────────────────── */}
        <div className="mb-sobre-md">
          {scanResult.isPDF ? (
            <div className="w-full h-40 rounded-card bg-card border border-border flex flex-col items-center justify-center gap-2 shadow-sm">
              <span className="text-5xl" aria-hidden="true">📋</span>
              <span className="text-sobre-base font-semibold text-text">{T.pdfLabel}</span>
            </div>
          ) : (
            <img
              src={scanResult.dataUrl}
              alt={T.photoAlt}
              className="w-full rounded-card shadow-sm object-contain max-h-56"
            />
          )}
        </div>

        {/* ── Extracted fields (Req 4.1–4.2) ───────────────────────────── */}
        {fields.length > 0 && (
          <div className="flex flex-col gap-3 mb-sobre-md">
            {fields.map((row) => (
              <FieldEditor
                key={row.key}
                row={row}
                onSave={handleFieldSave}
              />
            ))}
          </div>
        )}

        {/* ── Folder picker (Req 3.3) ───────────────────────────────────── */}
        <div className="mb-sobre-md">
          <label
            htmlFor="folder-select"
            className="block text-sobre-label font-semibold text-text mb-2"
          >
            {T.folder}
          </label>
          {/* Icon grid */}
          <div className="grid grid-cols-3 gap-2">
            {FOLDERS.map((f) => (
              <button
                key={f}
                onClick={() => setFolder(f)}
                aria-pressed={folder === f}
                className={[
                  'flex flex-col items-center justify-center gap-1',
                  'rounded-card border p-3 min-h-[72px] text-center transition-colors',
                  folder === f
                    ? 'bg-primary text-white border-primary font-bold'
                    : 'bg-card border-border text-text hover:border-primary/60 active:bg-primary/10',
                ].join(' ')}
              >
                <span className="text-2xl" aria-hidden="true">{FOLDER_ICONS[f]}</span>
                <span className="text-sobre-min font-semibold leading-tight">{f}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Member picker ─────────────────────────────────────────────── */}
        <div className="mb-sobre-md">
          <label
            htmlFor="member-select"
            className="block text-sobre-label font-semibold text-text mb-1"
          >
            {T.fieldMember}
          </label>
          {members.length === 0 ? (
            <p className="text-sobre-label text-text-secondary">{T.walangMiyembro}</p>
          ) : (
            <select
              id="member-select"
              value={selectedMemberId ?? ''}
              onChange={(e) => setSelectedMemberId(e.target.value ? Number(e.target.value) : null)}
              className="w-full min-h-touch rounded-btn border border-border px-3 text-sobre-base text-text bg-background"
            >
              <option value="">{T.chooseMember}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          {memberName && (
            <p className="text-sobre-label text-status-ayos-text mt-1">
              ✓ {memberName}
            </p>
          )}
        </div>

        {/* ── Save error ────────────────────────────────────────────────── */}
        {saveError && (
          <div className="bg-status-kulang-bg border border-status-kulang-text/20 rounded-card p-sobre-md mb-sobre-md">
            <p className="text-sobre-label text-status-kulang-text">{saveError}</p>
          </div>
        )}

        {/* ── Save button (Req 4.3) ─────────────────────────────────────── */}
        <div className="flex flex-col gap-3 mb-sobre-md">
          <PrimaryButton onClick={handleSave}>
            ✅ {T.saveBtn}
          </PrimaryButton>
          <OutlineButton onClick={onCancel}>
            {T.cancelBtn}
          </OutlineButton>
        </div>
      </div>
    </div>
  )
}
