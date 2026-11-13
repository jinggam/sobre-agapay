/**
 * ReminderCard component (Req 7.1–7.4)
 *
 * Shows a single upcoming reminder with:
 *  - Event kind label and date
 *  - Member name
 *  - "Dalhin" (what to bring) list
 *  - "I-download .ics" button
 *  - "Google Calendar" button
 */
import type { Event, Member, Reminder } from '../db';
import { downloadICS, getGoogleCalendarLink } from '../utils/reminders';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<Event['kind'], string> = {
  payout: 'Payout (4Ps)',
  fds: 'Family Development Session',
  checkup: 'Health Check-up',
  prenatal: 'Prenatal Check-up',
  deworming: 'Deworming',
  other: 'Event',
};

const KIND_EMOJI: Record<Event['kind'], string> = {
  payout: '💵',
  fds: '📚',
  checkup: '🏥',
  prenatal: '🤰',
  deworming: '💊',
  other: '📅',
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fil-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ReminderCardProps {
  event: Event;
  reminder: Reminder;
  member: Member;
}

export default function ReminderCard({ event, reminder, member }: ReminderCardProps) {
  const days = daysUntil(event.date);
  const label = KIND_LABEL[event.kind] ?? 'Event';
  const emoji = KIND_EMOJI[event.kind] ?? '📅';

  // Urgency styling: 0–1 days → red accent, 2–3 days → amber, else default
  const urgencyBorder =
    days <= 1
      ? 'border-l-status-kulang-text'
      : days <= 3
      ? 'border-l-status-malapit-text'
      : 'border-l-primary';

  const daysLabel =
    days === 0
      ? 'Ngayon'
      : days === 1
      ? 'Bukas'
      : `${days} araw na lang`;

  function handleDownloadICS() {
    downloadICS(event, reminder);
  }

  function handleGoogleCalendar() {
    const url = getGoogleCalendarLink(event, reminder);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <article
      className={[
        'sobre-card mb-sobre-sm border-l-4',
        urgencyBorder,
      ].join(' ')}
      aria-label={`Paalala: ${label}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">{emoji}</span>
          <div>
            <p className="font-bold text-sobre-base text-text leading-tight">{label}</p>
            <p className="text-sobre-label text-text-secondary">{member.name}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sobre-label font-semibold text-text">{formatDate(event.date)}</p>
          <p
            className={[
              'text-sobre-min font-medium',
              days <= 1
                ? 'text-status-kulang-text'
                : days <= 3
                ? 'text-status-malapit-text'
                : 'text-primary',
            ].join(' ')}
          >
            {daysLabel}
          </p>
        </div>
      </div>

      {/* Dalhin list (Req 7.4) */}
      {reminder.bringList.length > 0 && (
        <div
          className="mb-3 bg-background rounded-btn px-3 py-2"
          role="region"
          aria-label="Dalhin"
        >
          <p className="text-sobre-min font-bold text-text-secondary uppercase tracking-wide mb-1">
            Dalhin
          </p>
          <ul className="space-y-0.5">
            {reminder.bringList.map((item, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 text-sobre-label text-text"
              >
                <span className="text-primary font-bold" aria-hidden="true">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons (Req 7.3) */}
      <div className="flex gap-2">
        <button
          onClick={handleDownloadICS}
          className={[
            'flex-1 flex items-center justify-center gap-1',
            'min-h-touch rounded-btn border border-primary',
            'text-sobre-min font-semibold text-primary',
            'active:bg-primary active:text-white transition-colors',
            'px-2 py-2',
          ].join(' ')}
          aria-label="I-download ang .ics calendar file"
        >
          <span aria-hidden="true">📥</span>
          I-download .ics
        </button>

        <button
          onClick={handleGoogleCalendar}
          className={[
            'flex-1 flex items-center justify-center gap-1',
            'min-h-touch rounded-btn bg-action',
            'text-sobre-min font-semibold text-text',
            'active:opacity-80 transition-opacity',
            'px-2 py-2',
          ].join(' ')}
          aria-label="Idagdag sa Google Calendar"
        >
          <span aria-hidden="true">📆</span>
          Google Calendar
        </button>
      </div>
    </article>
  );
}
