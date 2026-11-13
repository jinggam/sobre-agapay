/**
 * Pamilya (Family) page (Req 6.1–6.3)
 *
 * Shows one compliance status card per member:
 *   • Name and role
 *   • Status badge: Ayos (green) | Malapit (yellow) | Kulang (red)
 *   • List of pending / overdue conditions
 *   • Quick "I-log" (log event) buttons for each pending condition
 *
 * Status is computed by rulesEngine.ts from saved Events in the local DB.
 */
import { useEffect, useState, useCallback } from 'react';
import { db } from '../db';
import type { Member, Event } from '../db';
import { getMemberStatus, type MemberStatus, type StatusValue } from '../utils/rulesEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberWithStatus {
  member: Member;
  status: MemberStatus;
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  StatusValue,
  { icon: string; label: string; textClass: string; bgClass: string }
> = {
  Ayos: {
    icon: '✓',
    label: 'Ayos',
    textClass: 'text-status-ayos-text',
    bgClass: 'bg-status-ayos-bg',
  },
  Malapit: {
    icon: '!',
    label: 'Malapit',
    textClass: 'text-status-malapit-text',
    bgClass: 'bg-status-malapit-bg',
  },
  Kulang: {
    icon: '✕',
    label: 'Kulang',
    textClass: 'text-status-kulang-text',
    bgClass: 'bg-status-kulang-bg',
  },
};

// ─── Role labels (Tagalog) ────────────────────────────────────────────────────

const ROLE_LABELS: Record<Member['role'], string> = {
  grantee: 'Grantee / Magulang',
  child: 'Bata',
  pregnant: 'Buntis',
  other: 'Iba pa',
};

// ─── Log event kind map ───────────────────────────────────────────────────────
// Maps a pending condition label to the event kind to log.
// This is a best-effort mapping; unknown labels default to 'other'.

const LABEL_TO_KIND: Record<string, Event['kind']> = {
  'Pulong ng Pamilya (FDS)': 'fds',
  'Pagpasok sa Paaralan': 'checkup',
  'Regular na Check-up / Bakuna': 'checkup',
  'Pag-inom ng Gamot sa Bulate (Deworming)': 'deworming',
  'Prenatal / Postnatal Check-up': 'prenatal',
};

function labelToKind(label: string): Event['kind'] {
  return LABEL_TO_KIND[label] ?? 'other';
}

// ─── Member status card ───────────────────────────────────────────────────────

interface MemberCardProps {
  memberWithStatus: MemberWithStatus;
  onLogEvent: (member: Member, conditionLabel: string, kind: Event['kind']) => void;
}

function MemberCard({ memberWithStatus, onLogEvent }: MemberCardProps) {
  const { member, status } = memberWithStatus;
  const config = STATUS_CONFIG[status.status];

  return (
    <div className="sobre-card mb-sobre-md" role="region" aria-label={`${member.name} — ${config.label}`}>
      {/* Header row: name + status badge */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-bold text-sobre-base text-text">{member.name}</p>
          <p className="text-sobre-label text-text-secondary">{ROLE_LABELS[member.role]}</p>
        </div>

        <span
          className={[
            'inline-flex items-center gap-1 px-3 py-1 rounded-full font-bold text-sobre-label',
            config.textClass,
            config.bgClass,
          ].join(' ')}
          aria-label={`Katayuan: ${config.label}`}
        >
          <span aria-hidden="true">{config.icon}</span>
          {config.label}
        </span>
      </div>

      {/* Pending / upcoming conditions */}
      {status.pendingConditions.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {status.pendingConditions.map((condition) => (
            <li
              key={condition}
              className="flex items-center justify-between gap-2 text-sobre-label text-text"
            >
              <span className="flex-1">{condition}</span>
              <button
                onClick={() => onLogEvent(member, condition, labelToKind(condition))}
                className={[
                  'shrink-0 min-h-touch px-3 py-1 rounded-btn text-sobre-label font-semibold',
                  'bg-primary text-white active:opacity-80 transition-opacity',
                ].join(' ')}
                aria-label={`I-log ang "${condition}" para kay ${member.name}`}
              >
                I-log
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sobre-label text-text-secondary mt-1">
          Lahat ng kondisyon ay natutupad. 🎉
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PamilyaPage() {
  const [membersWithStatus, setMembersWithStatus] = useState<MemberWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [logSuccess, setLogSuccess] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const members = await db.members.toArray();
      const allEvents = await db.events.toArray();

      const results: MemberWithStatus[] = await Promise.all(
        members.map(async (member) => {
          const memberEvents = allEvents.filter((e) => e.memberId === member.id);
          const status = await getMemberStatus(member, memberEvents);
          return { member, status };
        }),
      );

      setMembersWithStatus(results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleLogEvent = async (
    member: Member,
    conditionLabel: string,
    kind: Event['kind'],
  ) => {
    if (member.id == null) return;
    await db.events.add({
      memberId: member.id,
      kind,
      date: new Date(),
      done: true,
    });
    setLogSuccess(`Na-log na: "${conditionLabel}" para kay ${member.name}`);
    setTimeout(() => setLogSuccess(null), 3000);
    // Refresh statuses after logging
    await loadAll();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 overflow-y-auto px-sobre-md py-sobre-md">
      <h1 className="text-sobre-title font-bold text-text mb-sobre-md">Pamilya</h1>

      {/* Success toast */}
      {logSuccess && (
        <div
          role="status"
          aria-live="polite"
          className="mb-sobre-md p-3 rounded-card bg-status-ayos-bg text-status-ayos-text text-sobre-label font-semibold"
        >
          ✓ {logSuccess}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="sobre-card text-text-secondary text-sobre-base text-center py-8">
          <p>Nilo-load…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && membersWithStatus.length === 0 && (
        <div className="sobre-card text-text-secondary text-sobre-base">
          <p>
            Walang miyembro pa. Idagdag ang mga miyembro ng pamilya mula sa setup.
          </p>
        </div>
      )}

      {/* Member cards */}
      {!loading &&
        membersWithStatus.map(({ member, status }) => (
          <MemberCard
            key={member.id}
            memberWithStatus={{ member, status }}
            onLogEvent={handleLogEvent}
          />
        ))}
    </main>
  );
}
