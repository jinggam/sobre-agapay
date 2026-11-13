/**
 * Bahay (Home) page (Req 2.1 — scan button entry point, Req 6.4 — Gawin ngayong linggo).
 *
 * Contains: greeting, big "I-scan ang Papel" button, folder tiles, reminder cards.
 * The scan button opens ScanPage via the onScan callback passed from App.
 *
 * Req 6.4: When any family member is "Malapit" or "Kulang", a
 * "Gawin ngayong linggo" card is shown listing the pending conditions.
 *
 * Req 7: Shows upcoming ReminderCards for events within the next 30 days.
 */
import { useEffect, useState } from 'react';
import { db } from '../db';
import type { Member, Event, Reminder } from '../db';
import { getMemberStatus, type StatusValue } from '../utils/rulesEngine';
import ReminderCard from '../components/ReminderCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingItem {
  memberName: string;
  condition: string;
  status: StatusValue;
}

interface UpcomingReminder {
  event: Event;
  reminder: Reminder;
  member: Member;
}

// ─── Gawin ngayong linggo card ────────────────────────────────────────────────

interface GawinCardProps {
  items: PendingItem[];
}

function GawinNgayongLinggwCard({ items }: GawinCardProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="sobre-card mb-sobre-md border-l-4 border-action"
      role="region"
      aria-label="Gawin ngayong linggo"
    >
      <p className="font-bold text-sobre-base text-text mb-2">
        📋 Gawin ngayong linggo
      </p>
      <ul className="space-y-2">
        {items.map((item, idx) => {
          const isKulang = item.status === 'Kulang';
          return (
            <li key={idx} className="flex items-start gap-2 text-sobre-label text-text">
              <span
                aria-hidden="true"
                className={
                  isKulang
                    ? 'text-status-kulang-text font-bold shrink-0'
                    : 'text-status-malapit-text font-bold shrink-0'
                }
              >
                {isKulang ? '✕' : '!'}
              </span>
              <span>
                <span className="font-semibold">{item.memberName}</span>
                {' — '}
                {item.condition}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface BahayPageProps {
  onScan: () => void;
}

export default function BahayPage({ onScan }: BahayPageProps) {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingReminder[]>([]);

  // Req 6.4: load member statuses to determine pending items
  useEffect(() => {
    let cancelled = false;

    async function fetchPending() {
      try {
        const members: Member[] = await db.members.toArray();
        const allEvents = await db.events.toArray();

        const items: PendingItem[] = [];
        for (const member of members) {
          const memberEvents = allEvents.filter((e) => e.memberId === member.id);
          const { status, pendingConditions } = await getMemberStatus(member, memberEvents);
          if (status === 'Malapit' || status === 'Kulang') {
            for (const condition of pendingConditions) {
              items.push({ memberName: member.name, condition, status });
            }
          }
        }
        if (!cancelled) setPendingItems(items);
      } catch {
        // Silently ignore — home screen should never break due to rules engine
      }
    }

    fetchPending();
    return () => { cancelled = true; };
  }, []);

  // Req 7: load upcoming reminders (events within next 30 days with reminders)
  useEffect(() => {
    let cancelled = false;

    async function fetchUpcomingReminders() {
      try {
        const now = new Date();
        const thirtyDaysLater = new Date();
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

        // Fetch all events in the next 30 days
        const allEvents: Event[] = await db.events.toArray();
        const upcomingEvents = allEvents.filter((e) => {
          const eventDate = new Date(e.date);
          return eventDate >= now && eventDate <= thirtyDaysLater && !e.done;
        });

        if (upcomingEvents.length === 0) {
          if (!cancelled) setUpcomingReminders([]);
          return;
        }

        // For each upcoming event, check if a reminder exists
        const members: Member[] = await db.members.toArray();
        const memberMap = new Map<number, Member>(members.map((m) => [m.id!, m]));

        const results: UpcomingReminder[] = [];
        for (const event of upcomingEvents) {
          const reminder = await db.reminders
            .where('eventId')
            .equals(event.id!)
            .first();
          if (reminder) {
            const member = memberMap.get(event.memberId);
            if (member) {
              results.push({ event, reminder, member });
            }
          }
        }

        // Sort by event date ascending
        results.sort(
          (a, b) => new Date(a.event.date).getTime() - new Date(b.event.date).getTime(),
        );

        if (!cancelled) setUpcomingReminders(results);
      } catch {
        // Silently ignore — home screen should never break due to reminders
      }
    }

    fetchUpcomingReminders();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="flex-1 overflow-y-auto px-sobre-md py-sobre-md">
      <h1 className="text-sobre-title font-bold text-text mb-sobre-sm">Bahay</h1>
      <p className="text-sobre-base text-text-secondary mb-sobre-md">
        Maligayang pagdating sa Sobre.
      </p>

      {/* Primary scan action — large yellow button (Req 2.1) */}
      <button
        onClick={onScan}
        className={[
          'w-full min-h-touch flex items-center justify-center gap-3',
          'rounded-btn bg-action text-text font-bold text-sobre-base',
          'active:opacity-80 transition-opacity shadow-sm mb-sobre-md',
          'py-4',
        ].join(' ')}
        aria-label="I-scan ang Papel"
      >
        <span className="text-2xl" aria-hidden="true">📷</span>
        I-scan ang Papel
      </button>

      {/* Req 6.4 — "Gawin ngayong linggo" card: shown when any member is Malapit or Kulang */}
      <GawinNgayongLinggwCard items={pendingItems} />

      {/* Req 7 — Upcoming reminder cards (events within next 30 days) */}
      {upcomingReminders.length > 0 && (
        <section aria-label="Mga paalala">
          <p className="font-bold text-sobre-base text-text mb-sobre-sm">
            🔔 Mga Paalala
          </p>
          {upcomingReminders.map(({ event, reminder, member }) => (
            <ReminderCard
              key={reminder.id}
              event={event}
              reminder={reminder}
              member={member}
            />
          ))}
        </section>
      )}

      {/* Fallback paalala card when no pending items and no reminders */}
      {pendingItems.length === 0 && upcomingReminders.length === 0 && (
        <div className="sobre-card text-text-secondary text-sobre-base">
          <p className="font-semibold text-text mb-1">Mga Paalala</p>
          <p className="text-sobre-label">Walang paalala sa ngayon.</p>
        </div>
      )}
    </main>
  );
}
