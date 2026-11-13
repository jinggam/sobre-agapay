import Dexie, { type Table } from 'dexie';

// ─── TypeScript interfaces ────────────────────────────────────────────────────

/**
 * Top-level record for the 4Ps grantee's household.
 * There is exactly one Household per app installation (Req 1).
 *
 * pin — 4-digit app PIN (plain string, stored only on-device via IndexedDB).
 *       The design does NOT require hashing for MVP; this can be upgraded later.
 *       Per Req 1.4 this is the APP pin, never the cash card PIN.
 */
export interface Household {
  id?: number;
  granteeName: string;
  language: 'tl' | 'en';
  /** 4-digit app PIN (Req 1.1, 9.1). NOT the cash card PIN (Req 1.4). */
  pin: string;
  createdAt: Date;
}

/**
 * A family member belonging to the household.
 * role drives which compliance conditions apply (Req 1.2–1.3).
 */
export interface Member {
  id?: number;
  name: string;
  birthDate: Date;
  role: 'grantee' | 'child' | 'pregnant' | 'other';
}

/**
 * Folders as defined in the design doc (Req 5, 3.3).
 */
export type DocumentFolder =
  | 'Eskwela'
  | 'Kalusugan'
  | 'FDS'
  | 'Payout'
  | 'ID at Membership'
  | 'Abiso';

/**
 * A scanned / uploaded paper stored entirely on-device (Req 9.2).
 * imageBlob is the full binary — never sent to or kept on a server after OCR.
 */
export interface Document {
  id?: number;
  memberId: number;
  folder: DocumentFolder;
  /** AI-identified document type string (e.g. "FDS Schedule", "Payout Notice"). */
  type: string;
  docDate: Date;
  /** Key-value pairs extracted by OCR / AI (amount, venue, due date, …). */
  fields: Record<string, string>;
  ocrText: string;
  /** Raw image stored as a Blob in IndexedDB — no server copy (Req 9.2). */
  imageBlob: Blob;
  /** True once the user has confirmed / edited the extracted fields (Req 4.2). */
  corrected: boolean;
  createdAt: Date;
}

/**
 * A compliance or program event tied to a family member.
 * Can be derived from a saved Document or entered manually.
 */
export interface Event {
  id?: number;
  memberId: number;
  kind: 'fds' | 'checkup' | 'deworming' | 'prenatal' | 'payout' | 'other';
  date: Date;
  done: boolean;
  /** Optional link back to the Document that created this event. */
  sourceDocId?: number;
}

/**
 * Reminder schedule attached to an Event (Req 7).
 * remindAt holds one or more timestamps (default: 3 days before + morning of).
 */
export interface Reminder {
  id?: number;
  eventId: number;
  /** Array of ISO-8601 timestamps for each notification trigger. */
  remindAt: string[];
  /** Items the grantee should bring (e.g. ["4Ps ID", "Cash card"]). */
  bringList: string[];
}

// ─── Dexie database class ─────────────────────────────────────────────────────

class SobreDatabase extends Dexie {
  households!: Table<Household, number>;
  members!: Table<Member, number>;
  documents!: Table<Document, number>;
  events!: Table<Event, number>;
  reminders!: Table<Reminder, number>;

  constructor() {
    super('SobreDB');

    this.version(1).stores({
      /**
       * Household — single row; indexed on createdAt for ordering.
       */
      households: '++id, createdAt',

      /**
       * Member — indexed on role so the rules engine can quickly fetch
       * all children, pregnant members, etc. (Req 1.3, 6.2).
       */
      members: '++id, role',

      /**
       * Document — compound indexes for the most common queries:
       *   - by memberId  : show all papers for one person (Req 5.2)
       *   - by folder    : open a folder tile (Req 5.1)
       *   - [memberId+folder] : member-filtered folder view (Req 5.3)
       *   - by createdAt : newest-first sort (Req 5.2)
       *
       * imageBlob is intentionally NOT indexed — Dexie ignores Blob
       * columns during indexing; it is stored as binary by IndexedDB.
       */
      documents:
        '++id, memberId, folder, [memberId+folder], createdAt, docDate',

      /**
       * Event — indexed on memberId for tracker queries (Req 6.1–6.2)
       * and on [memberId+kind] for per-condition lookups (Req 6.3).
       */
      events: '++id, memberId, kind, [memberId+kind], date, done',

      /**
       * Reminder — indexed on eventId so reminders load instantly
       * when the event detail is opened (Req 7.1–7.2).
       */
      reminders: '++id, eventId',
    });
  }
}

// ─── Singleton instance ───────────────────────────────────────────────────────

/**
 * Shared Dexie database instance.
 * Import `db` throughout the app; Dexie manages the underlying
 * IndexedDB connection automatically.
 */
export const db = new SobreDatabase();
