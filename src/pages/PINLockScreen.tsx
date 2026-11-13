/**
 * PINLockScreen — full-screen PIN entry overlay (Requirement 9.1).
 *
 * Shows 4 dot indicators and a 12-key numpad (0-9, backspace, submit).
 * Calls onUnlock() when the entered 4-digit PIN matches the stored PIN.
 * Does NOT expose the actual PIN; validation is done by comparing against
 * the pinHash stored in the Household record.
 *
 * For the MVP, the PIN is stored as plain text in the Household record
 * (the design doc does not specify hashing; hashing can be added later).
 */
import { useState, useEffect, useCallback } from 'react'
import { db } from '../db/db'

interface PINLockScreenProps {
  onUnlock: () => void
}

const PIN_LENGTH = 4

export default function PINLockScreen({ onUnlock }: PINLockScreenProps) {
  const [digits, setDigits] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [storedPIN, setStoredPIN] = useState<string | null>(null)

  // Load the stored PIN from the household record once.
  useEffect(() => {
    db.households.toCollection().first().then((hh) => {
      if (hh?.pin) setStoredPIN(hh.pin)
    })
  }, [])

  const handleDigit = useCallback(
    (d: string) => {
      if (digits.length >= PIN_LENGTH) return
      setError(false)
      const next = [...digits, d]
      setDigits(next)

      if (next.length === PIN_LENGTH) {
        const entered = next.join('')
        if (storedPIN !== null && entered === storedPIN) {
          onUnlock()
        } else {
          // Brief shake then clear
          setError(true)
          setTimeout(() => {
            setDigits([])
            setError(false)
          }, 800)
        }
      }
    },
    [digits, storedPIN, onUnlock],
  )

  const handleBackspace = useCallback(() => {
    setError(false)
    setDigits((d) => d.slice(0, -1))
  }, [])

  // Physical keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key)
      else if (e.key === 'Backspace') handleBackspace()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleDigit, handleBackspace])

  const keys: (string | null)[] = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    null, '0', '⌫',
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-primary"
      role="dialog"
      aria-modal="true"
      aria-label="Ilagay ang inyong PIN"
    >
      {/* Branding */}
      <h1 className="text-white text-sobre-title font-bold mb-2">Sobre</h1>
      <p className="text-white/80 text-sobre-label mb-10">
        Ilagay ang inyong 4-digit PIN
      </p>

      {/* Dot indicators */}
      <div
        className={[
          'flex gap-5 mb-10 transition-transform duration-100',
          error ? 'translate-x-2 animate-shake' : '',
        ].join(' ')}
        aria-label={`${digits.length} ng ${PIN_LENGTH} na digit na naipasok`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={[
              'w-5 h-5 rounded-full border-2 transition-colors',
              i < digits.length
                ? 'bg-action border-action'
                : 'bg-transparent border-white/60',
              error ? 'border-red-300 bg-red-300' : '',
            ].join(' ')}
            aria-hidden="true"
          />
        ))}
      </div>

      {error && (
        <p className="text-red-200 text-sobre-label mb-6" role="alert">
          Maling PIN. Subukan ulit.
        </p>
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-72" role="group" aria-label="Numpad">
        {keys.map((key, idx) => {
          if (key === null) {
            return <span key={idx} aria-hidden="true" />
          }
          if (key === '⌫') {
            return (
              <button
                key={idx}
                onClick={handleBackspace}
                disabled={digits.length === 0}
                aria-label="Tanggalin ang huling digit"
                className={[
                  'flex items-center justify-center rounded-btn',
                  'min-h-touch text-white text-sobre-title font-semibold',
                  'bg-white/20 active:bg-white/30 transition-colors',
                  'disabled:opacity-30',
                ].join(' ')}
              >
                {key}
              </button>
            )
          }
          return (
            <button
              key={idx}
              onClick={() => handleDigit(key)}
              disabled={digits.length >= PIN_LENGTH}
              aria-label={key}
              className={[
                'flex items-center justify-center rounded-btn',
                'min-h-touch text-white text-sobre-title font-semibold',
                'bg-white/20 active:bg-white/30 transition-colors',
                'disabled:opacity-30',
              ].join(' ')}
            >
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
