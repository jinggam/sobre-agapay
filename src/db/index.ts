/**
 * Public API for the Sobre local database layer.
 *
 * Consumers only need to import from here:
 *
 *   import { db, type Member, type Document } from '../db';
 */
export { db } from './db';

export type {
  Household,
  Member,
  Document,
  DocumentFolder,
  Event,
  Reminder,
} from './db';
