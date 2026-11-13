/**
 * Rules Engine (Req 6.1–6.3, 1.3)
 *
 * Loads /rules.json (a configurable, editable file so rules can be updated
 * when DSWD guidelines change — Req 6.3).
 *
 * Given a Member and their Events, computes a MemberStatus:
 *   Ayos   — all applicable conditions are fulfilled for the current period
 *   Malapit — at least one condition is due within 7 days (or never logged)
 *   Kulang  — at least one condition is overdue
 *
 * Status colors (design.md):
 *   Ayos    #1E8E4E on #E3F4EA
 *   Malapit #8A5A00 on #FFF4D6
 *   Kulang  #9B2219 on #FBE3E1
 */

import type { Member, Event } from '../db';

// ─── Public types ─────────────────────────────────────────────────────────────

export type StatusValue = 'Ayos' | 'Malapit' | 'Kulang';

export interface MemberStatus {
  status: StatusValue;
  /** Human-readable labels of unfulfilled / upcoming conditions. */
  pendingConditions: string[];
}

// ─── rules.json shape ────────────────────────────────────────────────────────

interface RuleAppliesTo {
  roles: Array<'grantee' | 'child' | 'pregnant' | 'other'>;
  /** Minimum age in years (inclusive). Defaults to 0. */
  ageMin?: number;
  /** Maximum age in years (inclusive). Defaults to Infinity. */
  ageMax?: number;
}

interface RuleCondition {
  kind: Event['kind'];
  /** How many days between required occurrences. */
  frequencyDays: number;
  /** Days before the deadline at which status becomes "Malapit". */
  graceDays: number;
}

interface Rule {
  id: string;
  label: string;
  description: string;
  appliesTo: RuleAppliesTo;
  condition: RuleCondition;
}

interface RulesFile {
  rules: Rule[];
}

// ─── Module-level cache ───────────────────────────────────────────────────────

let cachedRules: Rule[] | null = null;

/**
 * Load and cache rules.json from the public folder.
 * On failure returns an empty array so the app still runs.
 */
export async function loadRules(): Promise<Rule[]> {
  if (cachedRules) return cachedRules;
  try {
    const res = await fetch('/rules.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: RulesFile = await res.json();
    cachedRules = data.rules ?? [];
  } catch (err) {
    console.error('[rulesEngine] Failed to load rules.json:', err);
    cachedRules = [];
  }
  return cachedRules;
}

/** Invalidate cache (useful in tests or after a hot reload). */
export function clearRulesCache(): void {
  cachedRules = null;
}

// ─── Age helper ───────────────────────────────────────────────────────────────

function ageInYears(birthDate: Date, referenceDate = new Date()): number {
  const years = referenceDate.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    referenceDate.getMonth() > birthDate.getMonth() ||
    (referenceDate.getMonth() === birthDate.getMonth() &&
      referenceDate.getDate() >= birthDate.getDate());
  return hasHadBirthday ? years : years - 1;
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Compute MemberStatus for a single member given their events.
 *
 * Algorithm per rule that applies to this member:
 *  1. Find the most recent *done* event of the matching kind.
 *  2. If none exists → the condition has never been fulfilled → Kulang.
 *  3. nextDueDate = lastDoneDate + frequencyDays.
 *  4. If today > nextDueDate → Kulang.
 *  5. If today ≥ nextDueDate − graceDays → Malapit.
 *  6. Otherwise → Ayos for this condition.
 *
 * Final status is the worst across all applicable conditions.
 * Rank: Kulang > Malapit > Ayos.
 */
export function computeMemberStatus(
  member: Member,
  events: Event[],
  rules: Rule[],
  today: Date = new Date(),
): MemberStatus {
  const memberAge = ageInYears(member.birthDate, today);
  const todayMs = today.getTime();

  let worstRank = 0; // 0=Ayos, 1=Malapit, 2=Kulang
  const pendingConditions: string[] = [];

  for (const rule of rules) {
    // Does this rule apply to this member's role?
    if (!rule.appliesTo.roles.includes(member.role)) continue;

    // Does this rule apply to this member's age?
    const ageMin = rule.appliesTo.ageMin ?? 0;
    const ageMax = rule.appliesTo.ageMax ?? Infinity;
    if (memberAge < ageMin || memberAge > ageMax) continue;

    // Find most recent done event of matching kind for this member
    const relevantEvents = events
      .filter(
        (e) =>
          e.memberId === member.id &&
          e.kind === rule.condition.kind &&
          e.done,
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const lastEvent = relevantEvents[0] ?? null;

    let conditionRank: 0 | 1 | 2;

    if (!lastEvent) {
      // Never done — overdue
      conditionRank = 2;
    } else {
      const lastMs = new Date(lastEvent.date).getTime();
      const nextDueMs =
        lastMs + rule.condition.frequencyDays * 24 * 60 * 60 * 1000;
      const graceStartMs =
        nextDueMs - rule.condition.graceDays * 24 * 60 * 60 * 1000;

      if (todayMs > nextDueMs) {
        conditionRank = 2; // Overdue
      } else if (todayMs >= graceStartMs) {
        conditionRank = 1; // Due within grace window
      } else {
        conditionRank = 0; // All good
      }
    }

    if (conditionRank > 0) {
      pendingConditions.push(rule.label);
    }
    if (conditionRank > worstRank) {
      worstRank = conditionRank;
    }
  }

  const statusMap: StatusValue[] = ['Ayos', 'Malapit', 'Kulang'];
  return {
    status: statusMap[worstRank],
    pendingConditions,
  };
}

/**
 * Convenience: load rules then compute status.
 * This is the main entry point for components.
 */
export async function getMemberStatus(
  member: Member,
  events: Event[],
  today?: Date,
): Promise<MemberStatus> {
  const rules = await loadRules();
  return computeMemberStatus(member, events, rules, today);
}
