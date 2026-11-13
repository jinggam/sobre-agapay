/**
 * usePINLock — manages app-level PIN lock state (Requirement 9.1).
 *
 * - Locks on first mount (app open) so the PIN is always required at start.
 * - Resets the 5-minute idle timer on any user interaction (pointermove,
 *   pointerdown, keydown, scroll).
 * - Exposes `unlock()` which callers invoke after a correct PIN entry.
 *
 * The PIN itself is stored in sessionStorage so it survives hot-reloads in
 * dev but is wiped when the tab/browser closes.  The source-of-truth PIN hash
 * lives in IndexedDB via the Household record (set during onboarding).
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const IDLE_MS = 5 * 60 * 1000 // 5 minutes

export interface UsePINLockResult {
  locked: boolean
  unlock: () => void
  resetIdle: () => void
}

export function usePINLock(active: boolean): UsePINLockResult {
  // Start locked so the PIN is required on every open (Req 9.1).
  const [locked, setLocked] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetIdle = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setLocked(true)
    }, IDLE_MS)
  }, [])

  const unlock = useCallback(() => {
    setLocked(false)
    resetIdle()
  }, [resetIdle])

  // Attach activity listeners once the user is authenticated.
  useEffect(() => {
    if (!active || locked) return

    const events: (keyof DocumentEventMap)[] = [
      'pointermove',
      'pointerdown',
      'keydown',
      'scroll',
    ]

    const handler = () => resetIdle()
    events.forEach((e) => document.addEventListener(e, handler, { passive: true }))
    // Start the initial idle countdown right away.
    resetIdle()

    return () => {
      events.forEach((e) => document.removeEventListener(e, handler))
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [active, locked, resetIdle])

  return { locked, unlock, resetIdle }
}
