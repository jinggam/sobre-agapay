/**
 * Tanong (Ask) page — Req 8.1–8.5
 *
 * Features:
 *  - Chat bubble UI: user messages (right, blue) and AI answers (left, white card)
 *  - Text input + send button at the bottom
 *  - Voice input via Web Speech API (shown only when browser supports it) — Req 8.5
 *  - Each AI answer card shows:
 *      • Answer text — Req 8.1
 *      • "Pakinggan" (read-aloud) button via SpeechSynthesis — Req 8.3
 *      • "Tingnan" source links per cited document — Req 8.2
 *  - Sends question + all saved document ocrTexts to /api/ask with language pref — Req 8.1
 *  - Official-decision referral message when needed — Req 8.4
 *  - "Kailangan ng internet" offline guard — Req 9.3
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { db } from '../db'
import type { Document, Household } from '../db'

// ─── Type declarations for Web Speech API (not in all TS libs) ───────────────

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition | undefined
    webkitSpeechRecognition: typeof SpeechRecognition | undefined
  }
}

// ─── Official-decision keywords ───────────────────────────────────────────────

/**
 * Keywords that signal an official decision is needed (Req 8.4).
 * Matches English and Tagalog variants.
 */
const OFFICIAL_DECISION_KEYWORDS = [
  'official-decision',
  'delist',
  'delisting',
  'appeal',
  'apela',
  'penalty',
  'multa',
  'suspension',
  'suspensyon',
  'city/municipal link',
  'municipal link',
  'city link',
  'lungsod/munisipal',
  'munisipal na link',
  'lungsod na link',
]

function requiresOfficialDecision(answer: string, sourceDocIds: string[]): boolean {
  if (sourceDocIds.includes('official-decision')) return true
  const lower = answer.toLowerCase()
  return OFFICIAL_DECISION_KEYWORDS.some((kw) => lower.includes(kw))
}

// ─── Referral message ─────────────────────────────────────────────────────────

function ReferralMessage({ language }: { language: 'tl' | 'en' }) {
  if (language === 'en') {
    return (
      <div
        className="mt-2 rounded-btn bg-status-malapit-bg border border-status-malapit-text px-3 py-2 text-sobre-label text-status-malapit-text"
        role="note"
        aria-label="Official decision referral"
      >
        ⚠️ For official decisions (e.g., delisting, appeal), please contact your{' '}
        <strong>City/Municipal Link</strong>.
      </div>
    )
  }
  return (
    <div
      className="mt-2 rounded-btn bg-status-malapit-bg border border-status-malapit-text px-3 py-2 text-sobre-label text-status-malapit-text"
      role="note"
      aria-label="Referral sa City/Municipal Link"
    >
      ⚠️ Para sa opisyal na desisyon (hal. delisting, apela), makipag-ugnayan sa inyong{' '}
      <strong>Lungsod/Munisipal na Link</strong>.
    </div>
  )
}

// ─── Message types ────────────────────────────────────────────────────────────

interface UserMessage {
  kind: 'user'
  id: string
  text: string
}

interface AIMessage {
  kind: 'ai'
  id: string
  answer: string
  sourceDocIds: string[]
  needsReferral: boolean
}

type ChatMessage = UserMessage | AIMessage

// ─── Pakinggan (read-aloud) button ────────────────────────────────────────────

function PakingganButton({ text, language }: { text: string; language: 'tl' | 'en' }) {
  const [speaking, setSpeaking] = useState(false)

  const handleClick = useCallback(() => {
    if (!window.speechSynthesis) return

    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'en' ? 'en-PH' : 'fil-PH'
    utterance.rate = 0.95

    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }, [text, language, speaking])

  if (!window.speechSynthesis) return null

  return (
    <button
      onClick={handleClick}
      className={[
        'inline-flex items-center gap-1 text-sobre-label font-semibold rounded-btn px-3 py-1 transition-colors',
        speaking
          ? 'bg-primary text-white'
          : 'bg-background text-primary border border-primary',
      ].join(' ')}
      aria-label={speaking ? 'Itigil ang pagbabasa' : 'Pakinggan ang sagot'}
      aria-pressed={speaking}
    >
      <span aria-hidden="true">{speaking ? '⏹' : '🔊'}</span>
      {speaking ? 'Itigil' : 'Pakinggan'}
    </button>
  )
}

// ─── Tingnan (source link) buttons ────────────────────────────────────────────

interface TingnanLinksProps {
  sourceDocIds: string[]
  documents: Document[]
  onView: (doc: Document) => void
}

function TingnanLinks({ sourceDocIds, documents, onView }: TingnanLinksProps) {
  if (sourceDocIds.length === 0) return null

  // Filter out meta-ids that aren't real document IDs
  const matchedDocs = sourceDocIds
    .filter((id) => id !== 'official-decision')
    .map((id) => {
      // IDs may come as "doc-5" (string index) or numeric string "5"
      const numId = parseInt(id.replace('doc-', ''), 10)
      return documents.find(
        (d) => d.id === numId || d.id === parseInt(id, 10),
      )
    })
    .filter((d): d is Document => d !== undefined)

  if (matchedDocs.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {matchedDocs.map((doc) => (
        <button
          key={doc.id}
          onClick={() => onView(doc)}
          className="inline-flex items-center gap-1 text-sobre-label text-primary font-semibold underline underline-offset-2 active:opacity-70"
          aria-label={`Tingnan ang ${doc.type}`}
        >
          📄 Tingnan: {doc.type}
        </button>
      ))}
    </div>
  )
}

// ─── Document preview modal ───────────────────────────────────────────────────

function DocPreviewModal({
  doc,
  onClose,
}: {
  doc: Document | null
  onClose: () => void
}) {
  const imgUrl = useRef<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!doc) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(doc.imageBlob)
    imgUrl.current = objectUrl
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      imgUrl.current = null
    }
  }, [doc])

  if (!doc) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label={`Papel: ${doc.type}`}
      onClick={onClose}
    >
      <div
        className="m-auto max-w-sm w-full bg-card rounded-card shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-sobre-md py-3 border-b border-border">
          <span className="font-bold text-sobre-base text-text">{doc.type}</span>
          <button
            onClick={onClose}
            className="text-text-secondary text-xl min-w-touch min-h-touch flex items-center justify-center"
            aria-label="Isara"
          >
            ✕
          </button>
        </div>
        {url && (
          <img
            src={url}
            alt={doc.type}
            className="w-full max-h-[60vh] object-contain bg-background"
          />
        )}
        {!url && (
          <div className="p-sobre-md text-text-secondary text-sobre-label">
            Walang preview na available.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TanongPage() {
  // ── Online state ───────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ── Household & documents ─────────────────────────────────────────────────
  const [household, setHousehold] = useState<Household | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])

  useEffect(() => {
    db.households.orderBy('createdAt').last().then((hh) => setHousehold(hh ?? null))
    db.documents.toArray().then(setDocuments)
  }, [])

  const language: 'tl' | 'en' = household?.language ?? 'tl'

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Voice input (Req 8.5) ──────────────────────────────────────────────────
  const SpeechRecognitionCtor =
    window.SpeechRecognition ?? window.webkitSpeechRecognition
  const hasSpeechRecognition = Boolean(SpeechRecognitionCtor)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<InstanceType<typeof SpeechRecognition> | null>(null)

  const startListening = useCallback(() => {
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = language === 'en' ? 'en-PH' : 'fil-PH'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript) setInputText((prev) => (prev ? prev + ' ' + transcript : transcript))
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognition.onerror = () => {
      setListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [SpeechRecognitionCtor, language])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const question = inputText.trim()
    if (!question || loading) return

    setInputText('')
    setError(null)

    // Offline guard (Req 9.3)
    if (!navigator.onLine) {
      setError(
        language === 'en'
          ? 'No internet connection.'
          : 'Kailangan ng internet para makapag-tanong.',
      )
      return
    }

    const userMsg: UserMessage = {
      kind: 'user',
      id: `user-${Date.now()}`,
      text: question,
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      // Collect document ocrTexts as context (Req 8.1)
      const docTexts = documents
        .filter((d) => d.ocrText)
        .map((d) => d.ocrText)
      const docIds = documents
        .filter((d) => d.ocrText)
        .map((d) => `doc-${d.id}`)

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          docTexts: docTexts.length > 0 ? docTexts : [''],
          language,
          sourceDocIds: docIds,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(
          data?.message ?? (language === 'en' ? 'Server error.' : 'May error sa server.'),
        )
      }

      const data = await response.json()
      const answer: string = data.answer ?? ''
      const sourceDocIds: string[] = data.sourceDocIds ?? []
      const needsReferral = requiresOfficialDecision(answer, sourceDocIds)

      const aiMsg: AIMessage = {
        kind: 'ai',
        id: `ai-${Date.now()}`,
        answer,
        sourceDocIds,
        needsReferral,
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : language === 'en' ? 'Something went wrong.' : 'May nangyaring mali.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [inputText, loading, language, documents])

  // ── Document preview modal ─────────────────────────────────────────────────
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)

  // ─── Keyboard send (Enter key) ─────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 overflow-hidden flex flex-col">
      {/* Chat message list */}
      <div
        className="flex-1 overflow-y-auto px-sobre-md py-sobre-md space-y-3"
        role="log"
        aria-live="polite"
        aria-label="Mga mensahe"
      >
        {/* Welcome hint */}
        {messages.length === 0 && !loading && (
          <div className="sobre-card text-text-secondary text-sobre-base">
            <p className="font-semibold text-text mb-1">
              {language === 'en' ? 'Ask a question' : 'Magtanong'}
            </p>
            <p className="text-sobre-label">
              {language === 'en'
                ? 'Example: "When is our next FDS?"'
                : 'Halimbawa: "Kailan ang susunod naming FDS?"'}
            </p>
          </div>
        )}

        {/* Chat bubbles */}
        {messages.map((msg) => {
          if (msg.kind === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div
                  className="max-w-[75%] rounded-card rounded-br-sm bg-primary text-white px-4 py-3 text-sobre-base shadow-sm"
                  role="article"
                  aria-label="Inyong tanong"
                >
                  {msg.text}
                </div>
              </div>
            )
          }

          // AI message
          return (
            <div key={msg.id} className="flex justify-start">
              <div
                className="max-w-[80%] sobre-card rounded-tl-sm shadow-sm"
                role="article"
                aria-label="Sagot ng AI"
              >
                {/* Answer text */}
                <p className="text-sobre-base text-text whitespace-pre-wrap leading-relaxed">
                  {msg.answer}
                </p>

                {/* Action row: Pakinggan + Tingnan */}
                <div className="mt-3 flex flex-col gap-2">
                  {/* Pakinggan button (Req 8.3) */}
                  <PakingganButton text={msg.answer} language={language} />

                  {/* Tingnan source links (Req 8.2) */}
                  <TingnanLinks
                    sourceDocIds={msg.sourceDocIds}
                    documents={documents}
                    onView={setPreviewDoc}
                  />
                </div>

                {/* Referral message (Req 8.4) */}
                {msg.needsReferral && <ReferralMessage language={language} />}
              </div>
            </div>
          )
        })}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start" aria-live="polite" aria-busy="true">
            <div className="sobre-card rounded-tl-sm shadow-sm text-text-secondary text-sobre-label animate-pulse">
              {language === 'en' ? 'Thinking…' : 'Nag-iisip…'}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="sobre-card border border-status-kulang-text bg-status-kulang-bg text-status-kulang-text text-sobre-label"
          >
            {error}
          </div>
        )}

        {/* Offline banner */}
        {!isOnline && (
          <div
            role="alert"
            className="sobre-card border border-status-kulang-text bg-status-kulang-bg text-status-kulang-text text-sobre-base"
          >
            <p className="font-semibold">📡 Kailangan ng internet</p>
            <p className="text-sobre-label mt-1">
              {language === 'en'
                ? 'Check your connection to ask questions.'
                : 'I-check ang inyong koneksyon para makapag-tanong.'}
            </p>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border bg-card px-sobre-md py-sobre-sm">
        <div className="flex items-end gap-2">
          {/* Text area */}
          <textarea
            className={[
              'flex-1 resize-none rounded-btn border border-border bg-background',
              'px-3 py-2 text-sobre-base text-text placeholder-text-secondary',
              'focus:outline-none focus:ring-2 focus:ring-primary',
              'min-h-touch max-h-32 leading-relaxed',
            ].join(' ')}
            rows={1}
            placeholder={
              language === 'en'
                ? 'Type your question…'
                : 'I-type ang inyong tanong…'
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={language === 'en' ? 'Your question' : 'Inyong tanong'}
            disabled={loading}
          />

          {/* Voice input button (Req 8.5) — only shown when browser supports it */}
          {hasSpeechRecognition && (
            <button
              onClick={listening ? stopListening : startListening}
              disabled={loading}
              className={[
                'shrink-0 min-w-touch min-h-touch flex items-center justify-center',
                'rounded-btn text-xl transition-colors',
                listening
                  ? 'bg-status-kulang-text text-white animate-pulse'
                  : 'bg-background border border-border text-primary',
              ].join(' ')}
              aria-label={
                listening
                  ? language === 'en'
                    ? 'Stop recording'
                    : 'Itigil ang pakikinig'
                  : language === 'en'
                    ? 'Voice input'
                    : 'Boses na input'
              }
              aria-pressed={listening}
            >
              🎤
            </button>
          )}

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={loading || !inputText.trim()}
            className={[
              'shrink-0 min-w-touch min-h-touch flex items-center justify-center',
              'rounded-btn bg-action text-text font-bold text-sobre-base',
              'transition-opacity px-4',
              loading || !inputText.trim() ? 'opacity-40' : 'active:opacity-80',
            ].join(' ')}
            aria-label={language === 'en' ? 'Send question' : 'Ipadala ang tanong'}
          >
            ➤
          </button>
        </div>
      </div>

      {/* Document preview modal */}
      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </main>
  )
}
