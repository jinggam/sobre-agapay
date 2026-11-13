/**
 * useOnboarding — checks whether the household setup has been completed.
 *
 * Returns:
 *   - loading   : true while the DB query is in-flight
 *   - completed : true once at least one Household row exists in IndexedDB
 *   - refresh   : call this after onboarding finishes to re-check
 *
 * Requirements: 1.1 — first open triggers onboarding when no household exists.
 */
import { useEffect, useState, useCallback } from 'react'
import { db } from '../db/db'

export interface UseOnboardingResult {
  loading: boolean
  completed: boolean
  refresh: () => void
}

export function useOnboarding(): UseOnboardingResult {
  const [loading, setLoading] = useState(true)
  const [completed, setCompleted] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function check() {
      setLoading(true)
      try {
        const count = await db.households.count()
        if (!cancelled) setCompleted(count > 0)
      } catch {
        if (!cancelled) setCompleted(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    check()
    return () => { cancelled = true }
  }, [tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  return { loading, completed, refresh }
}
