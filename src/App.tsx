/**
 * App — root component and app shell.
 *
 * Flow:
 *  1. While the DB is queried, show nothing (or a small spinner).
 *  2. If no household exists → show OnboardingPage (Req 1.1–1.2).
 *  3. If a household exists → show the main shell with bottom tabs.
 *  4. When the app opens or after 5 minutes idle, show PINLockScreen (Req 9.1).
 *  5. Scan button on Bahay → open ScanPage overlay (Req 2.1–2.4).
 *  6. After scan, open CheckCorrectPage overlay (Req 3.3–3.4, 4.1–4.3).
 *
 * Renders the bottom tab layout described in design.md:
 *   Bahay | Pamilya | Papeles | Tanong | Setting
 */
import { useState } from 'react'
import BottomTabBar, { type TabId } from './components/BottomTabBar'
import BahayPage from './pages/BahayPage'
import PamilyaPage from './pages/PamilyaPage'
import PapelesPage from './pages/PapelesPage'
import TanongPage from './pages/TanongPage'
import SettingsPage from './pages/SettingsPage'
import OnboardingPage from './pages/OnboardingPage'
import PINLockScreen from './pages/PINLockScreen'
import ScanPage, { type ScanResult } from './pages/ScanPage'
import CheckCorrectPage from './pages/CheckCorrectPage'
import { useOnboarding } from './hooks/useOnboarding'
import { usePINLock } from './hooks/usePINLock'
import { TextSizeProvider } from './contexts/TextSizeContext'

function renderTab(tab: TabId, onScan: () => void, onDeleteAll: () => void) {
  switch (tab) {
    case 'bahay':
      return <BahayPage onScan={onScan} />
    case 'pamilya':
      return <PamilyaPage />
    case 'papeles':
      return <PapelesPage />
    case 'tanong':
      return <TanongPage />
    case 'settings':
      return <SettingsPage onDeleteAll={onDeleteAll} />
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('bahay')

  // Scan flow state
  const [scanning, setScanning] = useState(false)
  // Check-and-correct screen state (Req 3.3–3.4, 4.1–4.3)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  // Req 1.1: check whether onboarding is complete
  const { loading, completed, refresh } = useOnboarding()

  // Req 9.1: PIN lock — only active once onboarding is done
  const { locked, unlock } = usePINLock(completed)

  const handleScanReady = (result: ScanResult) => {
    setScanResult(result)
    setScanning(false)
    // CheckCorrectPage will be shown by the scanResult guard below
  }

  // Called by SettingsPage after "Delete all data" — reset to onboarding
  const handleDeleteAll = () => {
    refresh()
    setActiveTab('bahay')
  }

  // ── Loading splash ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <TextSizeProvider>
        <div className="flex items-center justify-center h-dvh bg-background">
          <span className="text-primary text-sobre-title font-bold animate-pulse">
            Sobre
          </span>
        </div>
      </TextSizeProvider>
    )
  }

  // ── First run: onboarding ──────────────────────────────────────────────────
  if (!completed) {
    return (
      <TextSizeProvider>
        <OnboardingPage onComplete={refresh} />
      </TextSizeProvider>
    )
  }

  // ── Scan flow overlay ──────────────────────────────────────────────────────
  // Rendered as a full-screen overlay when the user taps "I-scan ang Papel".
  if (scanning) {
    return (
      <TextSizeProvider>
        <div className="flex flex-col h-dvh bg-background text-text relative">
          <header className="bg-primary text-white px-sobre-md py-3 flex items-center shadow-sm shrink-0">
            <h1 className="text-sobre-title font-bold tracking-tight">Sobre</h1>
          </header>
          <div className="flex-1 overflow-hidden flex flex-col">
            <ScanPage
              onImageReady={handleScanReady}
              onCancel={() => setScanning(false)}
            />
          </div>
        </div>
      </TextSizeProvider>
    )
  }

  // ── Check-and-correct overlay (Req 3.3–3.4, 4.1–4.3) ──────────────────────
  // Shown after a scan result is ready; closes on save or cancel.
  if (scanResult) {
    return (
      <TextSizeProvider>
        <div className="flex flex-col h-dvh bg-background text-text relative">
          <header className="bg-primary text-white px-sobre-md py-3 flex items-center shadow-sm shrink-0">
            <h1 className="text-sobre-title font-bold tracking-tight">Sobre</h1>
          </header>
          <div className="flex-1 overflow-hidden flex flex-col">
            <CheckCorrectPage
              scanResult={scanResult}
              onSaved={(_docId) => {
                setScanResult(null)
                setActiveTab('papeles')
              }}
              onCancel={() => setScanResult(null)}
            />
          </div>
        </div>
      </TextSizeProvider>
    )
  }

  // ── PIN lock overlay ───────────────────────────────────────────────────────
  // Rendered on top of the main shell so the tab state is preserved underneath.
  return (
    <TextSizeProvider>
      <div className="flex flex-col h-dvh bg-background text-text relative">
        {/* App-level header — simple top bar */}
        <header className="bg-primary text-white px-sobre-md py-3 flex items-center shadow-sm shrink-0">
          <h1 className="text-sobre-title font-bold tracking-tight">Sobre</h1>
        </header>

        {/* Page content — grows to fill available space */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {renderTab(activeTab, () => setScanning(true), handleDeleteAll)}
        </div>

        {/* Bottom navigation */}
        <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* PIN lock overlay — covers the whole viewport when locked (Req 9.1) */}
        {locked && <PINLockScreen onUnlock={unlock} />}
      </div>
    </TextSizeProvider>
  )
}
