/**
 * OnboardingPage — multi-step first-run wizard (Requirements 1.1, 1.2).
 *
 * Steps:
 *  1. Language   — Tagalog or English (Req 1.1)
 *  2. Name       — grantee's first name (Req 1.1)
 *  3. PIN        — choose a 4-digit app PIN (Req 1.1); NOT the cash card PIN (Req 1.4)
 *  4. Confirm PIN — re-enter to confirm
 *  5. Add member — first name, birth date, role (Req 1.2); repeatable
 *
 * When complete, one Household and one or more Member rows are written to Dexie,
 * then onComplete() is called so App can switch to the main shell.
 */
import { useState } from 'react'
import { db } from '../db/db'
import type { Member } from '../db/db'

interface OnboardingPageProps {
  onComplete: () => void
}

type Language = 'tl' | 'en'
type MemberRole = 'grantee' | 'child' | 'pregnant' | 'other'
type Step = 'language' | 'name' | 'pin' | 'confirm-pin' | 'add-member' | 'member-list'

interface PendingMember {
  name: string
  birthDate: string
  role: MemberRole
}

// ─── i18n strings ─────────────────────────────────────────────────────────────

const T = {
  tl: {
    welcome: 'Maligayang pagdating sa Sobre!',
    chooseLanguage: 'Pumili ng wika:',
    tagalog: 'Tagalog',
    english: 'Ingles',
    yourName: "Ano ang inyong pangalan?",
    namePlaceholder: 'Halimbawa: Maria',
    nameHint: 'Unang pangalan ng grantee',
    choosePin: 'Pumili ng 4-digit na PIN para sa app',
    pinNote: 'Hindi ito ang PIN ng cash card.',
    confirmPin: 'Ulitin ang PIN para kumpirmahin',
    pinMismatch: 'Hindi magkapareho. Subukan ulit.',
    addMember: 'Magdagdag ng miyembro ng pamilya',
    memberName: 'Unang pangalan',
    memberBirthDate: 'Petsa ng kapanganakan',
    memberRole: 'Papel sa pamilya',
    roles: {
      grantee: 'Grantee',
      child: 'Anak',
      pregnant: 'Buntis',
      other: 'Iba',
    },
    addBtn: 'Idagdag',
    addAnotherBtn: 'Dagdag pa',
    finishBtn: 'Tapos na',
    nextBtn: 'Susunod',
    members: 'Mga miyembro',
    noMembers: 'Walang miyembro pa.',
    pinEntry: 'Ilagay ang PIN',
    pinLengthError: 'Dapat 4 na digit ang PIN.',
  },
  en: {
    welcome: 'Welcome to Sobre!',
    chooseLanguage: 'Choose a language:',
    tagalog: 'Tagalog',
    english: 'English',
    yourName: "What is your first name?",
    namePlaceholder: 'e.g. Maria',
    nameHint: "Grantee's first name",
    choosePin: 'Choose a 4-digit app PIN',
    pinNote: 'This is not your cash card PIN.',
    confirmPin: 'Re-enter PIN to confirm',
    pinMismatch: "PINs don't match. Try again.",
    addMember: 'Add a family member',
    memberName: 'First name',
    memberBirthDate: 'Birth date',
    memberRole: 'Role in the family',
    roles: {
      grantee: 'Grantee',
      child: 'Child',
      pregnant: 'Pregnant member',
      other: 'Other',
    },
    addBtn: 'Add',
    addAnotherBtn: 'Add another',
    finishBtn: 'Finish',
    nextBtn: 'Next',
    members: 'Members',
    noMembers: 'No members yet.',
    pinEntry: 'Enter PIN',
    pinLengthError: 'PIN must be 4 digits.',
  },
}

// ─── Shared subcomponents ─────────────────────────────────────────────────────

function StepContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full px-sobre-md py-sobre-md gap-6 overflow-y-auto">
      {children}
    </div>
  )
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full min-h-touch flex items-center justify-center',
        'rounded-btn bg-action text-text font-bold text-sobre-base',
        'active:opacity-80 transition-opacity',
        'disabled:opacity-40',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── PIN numpad (reusable within onboarding) ──────────────────────────────────

function PINInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label: string
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
    <div className="flex flex-col items-center gap-6">
      <p className="text-sobre-label text-text-secondary">{label}</p>
      {/* Dots */}
      <div className="flex gap-4" aria-label={`${value.length} ng ${PIN_LENGTH} digits`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={[
              'w-5 h-5 rounded-full border-2 transition-colors',
              i < value.length
                ? 'bg-primary border-primary'
                : 'bg-transparent border-border',
            ].join(' ')}
            aria-hidden="true"
          />
        ))}
      </div>
      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-72">
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [step, setStep] = useState<Step>('language')
  const [language, setLanguage] = useState<Language>('tl')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [members, setMembers] = useState<PendingMember[]>([])

  // Add-member form state
  const [mName, setMName] = useState('')
  const [mBirthDate, setMBirthDate] = useState('')
  const [mRole, setMRole] = useState<MemberRole>('child')

  const t = T[language]

  // ── Step handlers ──────────────────────────────────────────────────────────

  const handleLanguageNext = (lang: Language) => {
    setLanguage(lang)
    setStep('name')
  }

  const handleNameNext = () => {
    if (name.trim().length === 0) return
    setStep('pin')
  }

  const handlePinNext = () => {
    if (pin.length !== 4) {
      setPinError(t.pinLengthError)
      return
    }
    setPinError('')
    setConfirmPin('')
    setStep('confirm-pin')
  }

  const handleConfirmPin = () => {
    if (confirmPin !== pin) {
      setPinError(t.pinMismatch)
      setPin('')
      setConfirmPin('')
      setStep('pin')
      return
    }
    setPinError('')
    setStep('member-list')
  }

  const handleAddMember = () => {
    if (!mName.trim() || !mBirthDate) return
    setMembers((prev) => [
      ...prev,
      { name: mName.trim(), birthDate: mBirthDate, role: mRole },
    ])
    setMName('')
    setMBirthDate('')
    setMRole('child')
    setStep('member-list')
  }

  const handleFinish = async () => {
    // Persist household
    const householdId = await db.households.add({
      granteeName: name.trim(),
      language,
      pin,
      createdAt: new Date(),
    })

    // Persist the grantee themselves as the first member (role: grantee)
    // then all additional members.
    const allMembers: Omit<Member, 'id'>[] = [
      {
        name: name.trim(),
        birthDate: new Date(), // grantee birthdate not collected in step 1; placeholder
        role: 'grantee',
      },
      ...members.map((m) => ({
        name: m.name,
        birthDate: new Date(m.birthDate),
        role: m.role,
      })),
    ]

    await db.members.bulkAdd(allMembers)

    // Suppress unused variable warning — householdId used for future cross-ref
    void householdId

    onComplete()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-dvh bg-background text-text">
      {/* Top bar */}
      <header className="bg-primary text-white px-sobre-md py-3 flex items-center shadow-sm shrink-0">
        <h1 className="text-sobre-title font-bold tracking-tight">Sobre</h1>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ── Step 1: Language ───────────────────────────────────────────── */}
        {step === 'language' && (
          <StepContainer>
            <div>
              <h2 className="text-sobre-title font-bold text-text mb-2">{t.welcome}</h2>
              <p className="text-sobre-base text-text-secondary">{t.chooseLanguage}</p>
            </div>
            <div className="flex flex-col gap-4">
              <PrimaryButton onClick={() => handleLanguageNext('tl')}>
                🇵🇭 {T.tl.tagalog}
              </PrimaryButton>
              <PrimaryButton onClick={() => handleLanguageNext('en')}>
                🇺🇸 {T.en.english}
              </PrimaryButton>
            </div>
          </StepContainer>
        )}

        {/* ── Step 2: Grantee name ───────────────────────────────────────── */}
        {step === 'name' && (
          <StepContainer>
            <div>
              <h2 className="text-sobre-title font-bold text-text mb-2">{t.yourName}</h2>
              <p className="text-sobre-label text-text-secondary">{t.nameHint}</p>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              autoFocus
              className="w-full border border-border rounded-btn px-sobre-md py-3 text-sobre-base bg-card focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={t.yourName}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNameNext() }}
            />
            <PrimaryButton onClick={handleNameNext} disabled={!name.trim()}>
              {t.nextBtn}
            </PrimaryButton>
          </StepContainer>
        )}

        {/* ── Step 3: Choose PIN ─────────────────────────────────────────── */}
        {step === 'pin' && (
          <StepContainer>
            <div>
              <h2 className="text-sobre-title font-bold text-text mb-1">{t.choosePin}</h2>
              <p className="text-sobre-label text-status-malapit-text bg-status-malapit-bg rounded px-2 py-1 inline-block">
                ⚠️ {t.pinNote}
              </p>
            </div>
            {pinError && (
              <p className="text-status-kulang-text text-sobre-label" role="alert">
                {pinError}
              </p>
            )}
            <PINInput value={pin} onChange={setPin} label={t.pinEntry} />
            <PrimaryButton onClick={handlePinNext} disabled={pin.length !== 4}>
              {t.nextBtn}
            </PrimaryButton>
          </StepContainer>
        )}

        {/* ── Step 4: Confirm PIN ────────────────────────────────────────── */}
        {step === 'confirm-pin' && (
          <StepContainer>
            <h2 className="text-sobre-title font-bold text-text">{t.confirmPin}</h2>
            <PINInput value={confirmPin} onChange={setConfirmPin} label={t.pinEntry} />
            <PrimaryButton onClick={handleConfirmPin} disabled={confirmPin.length !== 4}>
              {t.nextBtn}
            </PrimaryButton>
          </StepContainer>
        )}

        {/* ── Step 5: Member list / add more ────────────────────────────── */}
        {step === 'member-list' && (
          <StepContainer>
            <h2 className="text-sobre-title font-bold text-text">{t.members}</h2>

            {members.length === 0 ? (
              <p className="text-sobre-base text-text-secondary">{t.noMembers}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {members.map((m, i) => (
                  <li
                    key={i}
                    className="bg-card rounded-card px-sobre-md py-3 border border-border flex items-center gap-3"
                  >
                    <span className="text-sobre-base font-semibold flex-1">{m.name}</span>
                    <span className="text-sobre-label text-text-secondary">
                      {t.roles[m.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-3 mt-auto">
              <PrimaryButton onClick={() => setStep('add-member')}>
                {members.length === 0 ? t.addBtn : t.addAnotherBtn}
              </PrimaryButton>
              <button
                onClick={handleFinish}
                className="w-full min-h-touch flex items-center justify-center rounded-btn border border-primary text-primary font-bold text-sobre-base active:bg-primary/10 transition-colors"
              >
                {t.finishBtn}
              </button>
            </div>
          </StepContainer>
        )}

        {/* ── Step 6: Add member form ────────────────────────────────────── */}
        {step === 'add-member' && (
          <StepContainer>
            <h2 className="text-sobre-title font-bold text-text">{t.addMember}</h2>

            {/* Name */}
            <div>
              <label className="block text-sobre-label font-semibold mb-1" htmlFor="m-name">
                {t.memberName}
              </label>
              <input
                id="m-name"
                type="text"
                value={mName}
                onChange={(e) => setMName(e.target.value)}
                placeholder={t.namePlaceholder}
                autoFocus
                className="w-full border border-border rounded-btn px-sobre-md py-3 text-sobre-base bg-card focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Birth date */}
            <div>
              <label className="block text-sobre-label font-semibold mb-1" htmlFor="m-birthdate">
                {t.memberBirthDate}
              </label>
              <input
                id="m-birthdate"
                type="date"
                value={mBirthDate}
                onChange={(e) => setMBirthDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full border border-border rounded-btn px-sobre-md py-3 text-sobre-base bg-card focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Role */}
            <div>
              <p className="text-sobre-label font-semibold mb-2">{t.memberRole}</p>
              <div className="grid grid-cols-2 gap-3">
                {(['grantee', 'child', 'pregnant', 'other'] as MemberRole[]).map((role) => (
                  <button
                    key={role}
                    onClick={() => setMRole(role)}
                    className={[
                      'min-h-touch rounded-btn border text-sobre-label font-medium px-2 transition-colors',
                      mRole === role
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card text-text border-border active:bg-background',
                    ].join(' ')}
                  >
                    {t.roles[role]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-auto">
              <PrimaryButton
                onClick={handleAddMember}
                disabled={!mName.trim() || !mBirthDate}
              >
                {t.addBtn}
              </PrimaryButton>
              <button
                onClick={() => setStep('member-list')}
                className="w-full min-h-touch flex items-center justify-center rounded-btn border border-border text-text-secondary font-semibold text-sobre-base active:bg-background transition-colors"
              >
                {language === 'tl' ? 'Bumalik' : 'Back'}
              </button>
            </div>
          </StepContainer>
        )}
      </div>
    </div>
  )
}
