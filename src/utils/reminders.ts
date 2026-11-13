/**
 * Reminders utility (Req 7.1–7.4)
 *
 * - createReminder: saves Reminder to Dexie with default remindAt times
 * - scheduleWebNotifications: fires Web Notifications at each remindAt time
 * - generateICS: returns a valid .ics string for the event
 * - getGoogleCalendarLink: returns a Google Calendar "add event" URL
 */

import { db } from '../db';
import type { Event, Reminder } from '../db';

// ─── Bring lists per event kind (Req 7.4) ────────────────────────────────────

const BRING_LIST: Record<Event['kind'], string[]> = {
  payout: ['4Ps ID', 'Cash card'],
  fds: ['ID', 'Attendance sheet'],
  checkup: ['Health card', 'Immunization record'],
  prenatal: ['Health card', 'Immunization record'],
  deworming: ['Health card'],
  other: [],
};

// ─── createReminder ───────────────────────────────────────────────────────────

/**
 * Creates and saves a Reminder for an Event.
 *
 * Default schedule (Req 7.2):
 *   - 3 days before the event at 09:00 local time
 *   - Morning of the event at 08:00 local time
 *
 * Returns the saved Reminder with its auto-assigned id.
 */
export async function createReminder(
  eventId: number,
  date: Date,
  kind: Event['kind'],
): Promise<Reminder> {
  const eventDate = new Date(date);

  // 3 days before at 09:00
  const threeDaysBefore = new Date(eventDate);
  threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
  threeDaysBefore.setHours(9, 0, 0, 0);

  // Morning of the event at 08:00
  const morningOf = new Date(eventDate);
  morningOf.setHours(8, 0, 0, 0);

  const reminder: Reminder = {
    eventId,
    remindAt: [threeDaysBefore.toISOString(), morningOf.toISOString()],
    bringList: BRING_LIST[kind] ?? [],
  };

  const id = await db.reminders.add(reminder);
  return { ...reminder, id: id as number };
}

// ─── scheduleWebNotifications ─────────────────────────────────────────────────

/**
 * Requests Notification permission then schedules a Web Notification
 * for each remindAt timestamp in the reminder (Req 7.2).
 *
 * Uses setTimeout for near-future reminders. For reminders more than
 * ~24 days away, setTimeout may drift; a Service Worker push would be
 * more reliable in production, but this covers the MVP use-case.
 *
 * Returns true if permission was granted, false otherwise.
 */
export async function scheduleWebNotifications(
  reminder: Reminder,
  eventTitle: string,
): Promise<boolean> {
  if (!('Notification' in window)) return false;

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return false;

  const now = Date.now();

  for (const remindAtISO of reminder.remindAt) {
    const remindAtMs = new Date(remindAtISO).getTime();
    const delay = remindAtMs - now;

    if (delay < 0) continue; // Already past — skip

    const bringText =
      reminder.bringList.length > 0
        ? `\nDalhin: ${reminder.bringList.join(', ')}`
        : '';

    setTimeout(() => {
      new Notification(eventTitle, {
        body: `Paalala: ${eventTitle}${bringText}`,
        icon: '/favicon.svg',
        tag: `sobre-reminder-${reminder.id}-${remindAtMs}`,
      });
    }, delay);
  }

  return true;
}

// ─── generateICS ──────────────────────────────────────────────────────────────

/**
 * Generates a valid iCalendar (.ics) string for the given event and reminder.
 * Includes VALARM triggers matching each remindAt timestamp (Req 7.3).
 */
export function generateICS(event: Event, reminder: Reminder): string {
  const eventDate = new Date(event.date);

  // Format date as YYYYMMDDTHHmmssZ (UTC)
  const toICSDate = (d: Date): string =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // All-day start/end (DATE format)
  const toICSAllDay = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const startDate = toICSAllDay(eventDate);
  const nextDay = new Date(eventDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const endDate = toICSAllDay(nextDay);

  const kindLabel: Record<Event['kind'], string> = {
    payout: 'Payout (4Ps)',
    fds: 'Family Development Session',
    checkup: 'Health Check-up',
    prenatal: 'Prenatal Check-up',
    deworming: 'Deworming',
    other: 'Event',
  };
  const title = kindLabel[event.kind] ?? 'Sobre Event';
  const description =
    reminder.bringList.length > 0
      ? `Dalhin: ${reminder.bringList.join(', ')}`
      : 'Paalala mula sa Sobre';

  const uid = `sobre-event-${event.id ?? 0}-${Date.now()}@sobre.app`;
  const dtstamp = toICSDate(new Date());

  // Build VALARM blocks for each remindAt time
  const alarms = reminder.remindAt.map((remindAtISO) => {
    const triggerDate = toICSDate(new Date(remindAtISO));
    return [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${description}`,
      `TRIGGER;VALUE=DATE-TIME:${triggerDate}`,
      'END:VALARM',
    ].join('\r\n');
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sobre//Sobre MVP//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    ...alarms,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

// ─── getGoogleCalendarLink ────────────────────────────────────────────────────

/**
 * Returns a Google Calendar "add event" URL for the event (Req 7.3).
 * Opens pre-filled in Google Calendar when the user taps the link.
 */
export function getGoogleCalendarLink(event: Event, reminder: Reminder): string {
  const eventDate = new Date(event.date);

  // Google Calendar uses YYYYMMDD for all-day events
  const toGCalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const startDate = toGCalDate(eventDate);
  const nextDay = new Date(eventDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const endDate = toGCalDate(nextDay);

  const kindLabel: Record<Event['kind'], string> = {
    payout: 'Payout (4Ps)',
    fds: 'Family Development Session',
    checkup: 'Health Check-up',
    prenatal: 'Prenatal Check-up',
    deworming: 'Deworming',
    other: 'Event',
  };
  const title = kindLabel[event.kind] ?? 'Sobre Event';

  const details =
    reminder.bringList.length > 0
      ? `Dalhin: ${reminder.bringList.join(', ')}`
      : 'Paalala mula sa Sobre';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startDate}/${endDate}`,
    details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ─── downloadICS ──────────────────────────────────────────────────────────────

/**
 * Triggers a browser download of the .ics file for the given event.
 */
export function downloadICS(event: Event, reminder: Reminder): void {
  const icsContent = generateICS(event, reminder);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const kindSlug = event.kind.replace(/[^a-z]/g, '-');
  a.download = `sobre-${kindSlug}-${new Date(event.date).toISOString().slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
