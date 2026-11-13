/**
 * SettingsPage — language, text size, PIN change, and data deletion.
 *
 * Sections:
 *  1. Language toggle: Tagalog / English (updates Household.language in Dexie)
 *  2. Text size: Normal / Malaki / Napaka-laki (updates <html data-textsize>)
 *  3. Change PIN: current PIN → new PIN × 2, validates, saves to Dexie
 *  4. Delete a paper: list of all documents with per-row delete + confirmation
 *  5. Delete all data: destructive double-confirm dialog (Req 9.4)
 */
import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Document } from '../db'
import { useTextSize, type TextSize } from '../contexts/TextSizeContext'

// ─── i18n ─────────────────────────────────────────────────────────────────────

const T = {
  tl: {
    settings: 'Mga Setting',
    language: 'Wika',
    tagalog: 'Tagalog',
    english: 'Ingles',
    textSize: 'Laki ng Teksto',
    sizeNormal: 'Normal',
    sizeMalaki: 'Malaki',
    sizeNapakaLaki: 'Napaka-laki',
    changePin: 'Palitan ang PIN',
    currentPin: 'Kasalukuyang PIN',
    newPin: 'Bagong PIN',
    confirmNewPin: 'Ulitin ang bagong PIN',
    pinWrong: 'Mali ang kasalukuyang PIN.',
    pinMismatch: 'Hindi magkapareho ang bagong PIN.',
    pinShort: 'Dapat 4 na digit ang PIN.',
    pinChanged: 'Nabago na ang PIN.',
    savePin: 'I-save ang PIN',
    deletePaper: 'Tanggalin ang Papel',
    noPapers: 'Walang naka-save na papel.',
    deleteBtn: 'Tanggalin',
    confirmDeletePaper: 'Sigurado ka bang tanggalin ang papel na ito?',
    confirmDeletePaperYes: 'Oo, tanggalin',
    confirmDeletePaperNo: 'Huwag',
    deleteAll: 'Tanggalin ang Lahat ng Data',
    deleteAllWarning: 'Mabubura ang lahat ng impormasyon ng inyong pamilya.',
    deleteAllBtn: 'Tanggalin ang Lahat',
    deleteAllConfirm1: 'Sigurado ka ba? Mabubura ang lahat.',
    deleteAllConfirm2: 'Talagang sigurado ka? Hindi na ito maibabalik.',
    deleteAllConfirmBtn: 'Oo, burahin ang lahat',
    deleteAllCancel: 'Huwag',
    pinEntry: 'Ilagay ang PIN',
    deleted: 'Nabura.',
  },
  en: {
    settings: 'Settings',
    language: 'Language',
    tagalog: 'Tagalog',
    english: 'English',
    textSize: 'Text Size',
    sizeNormal: 'Normal',
    sizeMalaki: 'Large',
    sizeNapakaLaki: 'Extra Large',
    changePin: 'Change PIN',
    currentPin: 'Current PIN',
    newPin: 'New PIN',
    confirmNewPin: 'Confirm new PIN',
    pinWrong: 'Current PIN is incorrect.',
    pinMismatch: "New PINs don't match.",
    pinShort: 'PIN must be 4 digits.',
    pinChanged: 'PIN changed successfully.',
    savePin: 'Save PIN',
    deletePaper: 'Delete a Paper',
    noPapers: 'No saved papers.',
    deleteBtn: 'Delete',
    confirmDeletePaper: 'Are you sure you want to delete this paper?',
    confirmDeletePaperYes: 'Yes, delete',
    confirmDeletePaperNo: 'Cancel',
    deleteAll: 'Delete All Data',
    deleteAllWarning: 'This will erase all your family information.',
    deleteAllBtn: 'Delete All',
    deleteAllConfirm1: 'Are you sure? Everything will be erased.',
    deleteAllConfirm2: 'Really sure? This cannot be undone.',
    deleteAllConfirmBtn: 'Yes, erase everything',
    deleteAllCancel: 'Cancel',
    pinEntry: 'Enter PIN',
    deleted: 'Deleted.',
  },
} as const

type Lang = 'tl' | 'en'

// ─── Shared subcomponents ─────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sobre-label font-bold text-primary uppercase tracking-wide px-sobre-md pt-sobre-md pb-1">
      {children}
    </h2>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="sobre-card mx-sobre-md mb-sobre-md">{children}</div>
}

// ─── Mini PIN numpad ──────────────────────────────────────────────────────────

function PINInput({
  value,
  onChange,
  label,
  id,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  id: string
}) {
  const PIN_LENGTH = 4
  const handleDigit = (d: string) => {
    if (value.length < PIN_LENGTH) onChange(value + d)
  }
  const handleBack = () => onChange(value.slice(0, -1))

  const keys: (string | null)[] = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    null, '0', '⌫',
  ]

  return (
    <div className="flex flex-col items-center gap-4" id={id}>
      <p className="text-sobre-label text-text-secondary">{label}</p>
      {/* Dots */}
      <div className="flex gap-3" aria-label={`${value.length} ng ${PIN_LENGTH} digits`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={[
              'w-4 h-4 rounded-full border-2 transition-colors',
              i < value.length
                ? 'bg-primary border-primary'
                : 'bg-transparent border-border',
            ].join(' ')}
            aria-hidden="true"
          />
        ))}
      </div>
      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2 w-64">
        {keys.map((key, idx) => {
          if (key === null) return <span key={idx} aria-hidden="true" />
          if (key === '⌫') {
            return (
              <button
                key={idx}
                onClick={handleBack}
                disabled={value.length === 0}
                aria-label="Tanggalin ang huling digit"
                className="flex items-center justify-center min-h-touch rounded-btn bg-background border border-border text-sobre-title active:bg-border disabled:opacity-30 transition-colors"
              >
                {key}
              </button>
            )
          }
          return (
            <button
              key={idx}
              onClick={() => handleDigit(key)}
              disabled={value.length >= PIN_LENGTH}
              aria-label={key}
              className="flex items-center justify-center min-h-touch rounded-btn bg-background border border-border text-sobre-title font-semibold active:bg-border disabled:opacity-30 transition-colors"
            >
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Confirmation dialog ──────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  destructive = false,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-sobre-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-card rounded-card w-full max-w-sm p-sobre-md shadow-xl flex flex-col gap-sobre-md">
        <p className="text-sobre-base text-text font-semibold text-center">{message}</p>
        <button
          onClick={onConfirm}
          className={[
            'w-full min-h-touch flex items-center justify-center rounded-btn font-bold text-sobre-base transition-colors',
            destructive
              ? 'bg-status-kulang-text text-white active:opacity-80'
              : 'bg-action text-text active:opacity-80',
          ].join(' ')}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          className="w-full min-h-touch flex items-center justify-center rounded-btn border border-border text-text-secondary font-semibold text-sobre-base active:bg-background transition-colors"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface SettingsPageProps {
  /** Called after "Delete all data" to send the user back to onboarding. */
  onDeleteAll: () => void
}

export default function SettingsPage({ onDeleteAll }: SettingsPageProps) {
  // ── Language ──────────────────────────────────────────────────────────────
  const [lang, setLang] = useState<Lang>('tl')
  const t = T[lang]

  // ── Text size ─────────────────────────────────────────────────────────────
  const { textSize, setTextSize } = useTextSize()

  // ── PIN change state ──────────────────────────────────────────────────────
  type PinStep = 'current' | 'new' | 'confirm'
  const [pinStep, setPinStep] = useState<PinStep>('current')
  const [currentPinInput, setCurrentPinInput] = useState('')
  const [newPinInput, setNewPinInput] = useState('')
  const [confirmPinInput, setConfirmPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState(false)

  // ── Documents ─────────────────────────────────────────────────────────────
  const [documents, setDocuments] = useState<Document[]>([])
  const [pendingDeleteDocId, setPendingDeleteDocId] = useState<number | null>(null)

  // ── Delete all ────────────────────────────────────────────────────────────
  // Two-step confirmation
  const [deleteAllStep, setDeleteAllStep] = useState<0 | 1 | 2>(0)

  // ── Load language & documents from DB ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const household = await db.households.toCollection().first()
        if (!cancelled && household) {
          setLang(household.language)
        }
        const docs = await db.documents.orderBy('createdAt').reverse().toArray()
        if (!cancelled) setDocuments(docs)
      } catch {
        // Silently ignore read errors
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLanguageChange = async (newLang: Lang) => {
    setLang(newLang)
    try {
      const household = await db.households.toCollection().first()
      if (household?.id != null) {
        await db.households.update(household.id, { language: newLang })
      }
    } catch {
      // Silently ignore
    }
  }

  // PIN step: validate current PIN
  const handleCurrentPin = async () => {
    if (currentPinInput.length !== 4) {
      setPinError(t.pinShort)
      return
    }
    try {
      const household = await db.households.toCollection().first()
      if (household?.pin !== currentPinInput) {
        setPinError(t.pinWrong)
        setCurrentPinInput('')
        return
      }
    } catch {
      setPinError(t.pinWrong)
      return
    }
    setPinError('')
    setNewPinInput('')
    setPinStep('new')
  }

  const handleNewPin = () => {
    if (newPinInput.length !== 4) {
      setPinError(t.pinShort)
      return
    }
    setPinError('')
    setConfirmPinInput('')
    setPinStep('confirm')
  }

  const handleConfirmPin = async () => {
    if (confirmPinInput !== newPinInput) {
      setPinError(t.pinMismatch)
      setNewPinInput('')
      setConfirmPinInput('')
      setPinStep('new')
      return
    }
    try {
      const household = await db.households.toCollection().first()
      if (household?.id != null) {
        await db.households.update(household.id, { pin: newPinInput })
      }
    } catch {
      // Silently ignore
    }
    setPinError('')
    setPinSuccess(true)
    setCurrentPinInput('')
    setNewPinInput('')
    setConfirmPinInput('')
    setPinStep('current')
    setTimeout(() => setPinSuccess(false), 3000)
  }

  const resetPinFlow = () => {
    setCurrentPinInput('')
    setNewPinInput('')
    setConfirmPinInput('')
    setPinError('')
    setPinSuccess(false)
    setPinStep('current')
  }

  // Delete single document
  const handleConfirmDeleteDoc = async () => {
    if (pendingDeleteDocId == null) return
    try {
      await db.documents.delete(pendingDeleteDocId)
      setDocuments((prev) => prev.filter((d) => d.id !== pendingDeleteDocId))
    } catch {
      // Silently ignore
    }
    setPendingDeleteDocId(null)
  }

  // Delete all — step 1 → 2 → execute
  const handleDeleteAllConfirm = async () => {
    if (deleteAllStep === 1) {
      setDeleteAllStep(2)
      return
    }
    if (deleteAllStep === 2) {
      try {
        await db.documents.clear()
        await db.events.clear()
        await db.reminders.clear()
        await db.members.clear()
        await db.households.clear()
      } catch {
        // Silently ignore
      }
      onDeleteAll()
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const TEXT_SIZE_OPTIONS: { value: TextSize; label: string }[] = [
    { value: 'normal', label: t.sizeNormal },
    { value: 'malaki', label: t.sizeMalaki },
    { value: 'napaka-laki', label: t.sizeNapakaLaki },
  ]

  return (
    <main className="flex-1 overflow-y-auto pb-sobre-md" aria-label={t.settings}>
      <h1 className="text-sobre-title font-bold text-text px-sobre-md pt-sobre-md pb-sobre-sm">
        ⚙️ {t.settings}
      </h1>

      {/* ── 1. Language ─────────────────────────────────────────────────── */}
      <SectionHeader>{t.language}</SectionHeader>
      <Card>
        <div className="flex gap-3">
          {(['tl', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => handleLanguageChange(l)}
              className={[
                'flex-1 min-h-touch flex items-center justify-center rounded-btn border font-semibold text-sobre-base transition-colors',
                lang === l
                  ? 'bg-primary text-white border-primary'
                  : 'bg-background text-text border-border active:bg-border',
              ].join(' ')}
              aria-pressed={lang === l}
            >
              {l === 'tl' ? `🇵🇭 ${t.tagalog}` : `🇺🇸 ${t.english}`}
            </button>
          ))}
        </div>
      </Card>

      {/* ── 2. Text size ────────────────────────────────────────────────── */}
      <SectionHeader>{t.textSize}</SectionHeader>
      <Card>
        <div className="flex gap-3">
          {TEXT_SIZE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTextSize(value)}
              className={[
                'flex-1 min-h-touch flex items-center justify-center rounded-btn border font-semibold text-sobre-label transition-colors',
                textSize === value
                  ? 'bg-primary text-white border-primary'
                  : 'bg-background text-text border-border active:bg-border',
              ].join(' ')}
              aria-pressed={textSize === value}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {/* ── 3. Change PIN ───────────────────────────────────────────────── */}
      <SectionHeader>{t.changePin}</SectionHeader>
      <Card>
        {pinSuccess && (
          <p className="text-status-ayos-text text-sobre-label font-semibold mb-sobre-sm text-center" role="status">
            ✓ {t.pinChanged}
          </p>
        )}
        {pinError && (
          <p className="text-status-kulang-text text-sobre-label mb-sobre-sm text-center" role="alert">
            {pinError}
          </p>
        )}

        {pinStep === 'current' && (
          <div className="flex flex-col gap-sobre-md">
            <PINInput
              id="pin-current"
              value={currentPinInput}
              onChange={setCurrentPinInput}
              label={t.currentPin}
            />
            <button
              onClick={handleCurrentPin}
              disabled={currentPinInput.length !== 4}
              className="w-full min-h-touch flex items-center justify-center rounded-btn bg-primary text-white font-bold text-sobre-base disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {lang === 'tl' ? 'Susunod' : 'Next'}
            </button>
          </div>
        )}

        {pinStep === 'new' && (
          <div className="flex flex-col gap-sobre-md">
            <PINInput
              id="pin-new"
              value={newPinInput}
              onChange={setNewPinInput}
              label={t.newPin}
            />
            <button
              onClick={handleNewPin}
              disabled={newPinInput.length !== 4}
              className="w-full min-h-touch flex items-center justify-center rounded-btn bg-primary text-white font-bold text-sobre-base disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {lang === 'tl' ? 'Susunod' : 'Next'}
            </button>
            <button
              onClick={resetPinFlow}
              className="text-sobre-label text-text-secondary underline text-center"
            >
              {lang === 'tl' ? 'Bumalik' : 'Back'}
            </button>
          </div>
        )}

        {pinStep === 'confirm' && (
          <div className="flex flex-col gap-sobre-md">
            <PINInput
              id="pin-confirm"
              value={confirmPinInput}
              onChange={setConfirmPinInput}
              label={t.confirmNewPin}
            />
            <button
              onClick={handleConfirmPin}
              disabled={confirmPinInput.length !== 4}
              className="w-full min-h-touch flex items-center justify-center rounded-btn bg-primary text-white font-bold text-sobre-base disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {t.savePin}
            </button>
            <button
              onClick={resetPinFlow}
              className="text-sobre-label text-text-secondary underline text-center"
            >
              {lang === 'tl' ? 'Bumalik' : 'Back'}
            </button>
          </div>
        )}
      </Card>

      {/* ── 4. Delete a paper ───────────────────────────────────────────── */}
      <SectionHeader>{t.deletePaper}</SectionHeader>
      <Card>
        {documents.length === 0 ? (
          <p className="text-sobre-label text-text-secondary">{t.noPapers}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {documents.map((doc) => (
              <li key={doc.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sobre-base font-semibold text-text truncate">
                    {doc.type || doc.folder}
                  </p>
                  <p className="text-sobre-min text-text-secondary">
                    {doc.folder} ·{' '}
                    {new Date(doc.docDate).toLocaleDateString(
                      lang === 'tl' ? 'fil-PH' : 'en-PH',
                      { year: 'numeric', month: 'short', day: 'numeric' },
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setPendingDeleteDocId(doc.id!)}
                  className="shrink-0 min-h-touch min-w-touch flex items-center justify-center rounded-btn border border-status-kulang-text text-status-kulang-text font-semibold text-sobre-label px-3 active:bg-status-kulang-bg transition-colors"
                  aria-label={`${t.deleteBtn}: ${doc.type || doc.folder}`}
                >
                  🗑 {t.deleteBtn}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── 5. Delete all data ──────────────────────────────────────────── */}
      <SectionHeader>{t.deleteAll}</SectionHeader>
      <div className="mx-sobre-md mb-sobre-md">
        <div className="sobre-card border border-status-kulang-text/40 bg-status-kulang-bg/30">
          <p className="text-sobre-label text-status-kulang-text mb-sobre-md">
            ⚠️ {t.deleteAllWarning}
          </p>
          <button
            onClick={() => setDeleteAllStep(1)}
            className="w-full min-h-touch flex items-center justify-center rounded-btn bg-status-kulang-text text-white font-bold text-sobre-base active:opacity-80 transition-opacity"
          >
            🗑 {t.deleteAllBtn}
          </button>
        </div>
      </div>

      {/* ── Single-doc delete confirmation dialog ────────────────────────── */}
      {pendingDeleteDocId != null && (
        <ConfirmDialog
          message={t.confirmDeletePaper}
          confirmLabel={t.confirmDeletePaperYes}
          cancelLabel={t.confirmDeletePaperNo}
          onConfirm={handleConfirmDeleteDoc}
          onCancel={() => setPendingDeleteDocId(null)}
          destructive
        />
      )}

      {/* ── Delete-all step 1 dialog ─────────────────────────────────────── */}
      {deleteAllStep === 1 && (
        <ConfirmDialog
          message={t.deleteAllConfirm1}
          confirmLabel={t.deleteAllConfirmBtn}
          cancelLabel={t.deleteAllCancel}
          onConfirm={handleDeleteAllConfirm}
          onCancel={() => setDeleteAllStep(0)}
          destructive
        />
      )}

      {/* ── Delete-all step 2 dialog ─────────────────────────────────────── */}
      {deleteAllStep === 2 && (
        <ConfirmDialog
          message={t.deleteAllConfirm2}
          confirmLabel={t.deleteAllConfirmBtn}
          cancelLabel={t.deleteAllCancel}
          onConfirm={handleDeleteAllConfirm}
          onCancel={() => setDeleteAllStep(0)}
          destructive
        />
      )}
    </main>
  )
}
