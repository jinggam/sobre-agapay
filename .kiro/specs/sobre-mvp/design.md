# Design Document

## Overview
Sobre is a local-first PWA. The phone holds the data; a thin proxy calls
Lumen OCR and Lumen AI Chat. Four bottom tabs: Bahay (Home), Pamilya (Family),
Papeles (Documents), Tanong (Ask). A big yellow "I-scan ang Papel" button sits
on Home.

## Architecture
- UI (React PWA) -> Local DB (IndexedDB/Dexie)
- UI -> Proxy API -> Lumen OCR / Lumen AI Chat
- Proxy endpoints:
  - POST /api/read   (image/PDF) -> { text, fields, confidence }
  - POST /api/ask    (question, selected doc texts) -> { answer, sourceDocIds }
- Rules engine runs on the device using rules.json.

## Data models
- Household { id, granteeName, language, createdAt }
- Member { id, name, birthDate, role: grantee|child|pregnant|other }
- Document { id, memberId, folder, type, docDate, fields{}, ocrText,
  imageBlob, corrected: boolean, createdAt }
- Event { id, memberId, kind: fds|checkup|deworming|prenatal|payout|other,
  date, done: boolean, sourceDocId? }
- Reminder { id, eventId, remindAt[], bringList[] }

## Folders
Eskwela (school), Kalusugan (health), FDS, Payout, ID at Membership, Abiso (notices).

## Compliance rules (rules.json, editable; verify against current DSWD guidelines)
- Child 3-18: enrolled; school attendance at least 85% per month.
- Child 0-5: regular preventive check-ups and immunization.
- School-age child: deworming twice a year.
- Pregnant member: prenatal and postnatal check-ups.
- Grantee/parent: attend monthly Family Development Session (FDS).
Status: Ayos = done for period; Malapit = due within 7 days; Kulang = overdue.

## Read pipeline
1. Capture -> crop/deskew/contrast (canvas) -> compress.
2. /api/read -> Lumen OCR text.
3. Lumen AI Chat prompt returns JSON only:
   { type, folder, memberName, docDate, keyFields{}, confidence{} }
4. Match memberName to Member list (fuzzy); unsure fields flagged.
5. Confirm screen -> save Document -> offer Event/Reminder if a future date exists.

## Tanong prompt rules
- Answer in the user's language, max ~80 words, short sentences.
- Use only the provided documents; if unsure, say so.
- Cite source document ids.
- For official decisions, refer to the City/Municipal Link.

## Visual design tokens
- Primary blue #1F4FA3; Action yellow #F5B400; Background #F7F5F0; Card #FFFFFF
- Text #1B1B1F; Secondary text #5A5A63; Border #E2DED5
- Status: Ayos #1E8E4E on #E3F4EA; Malapit #8A5A00 on #FFF4D6; Kulang #9B2219 on #FBE3E1
- Font: system sans (Roboto on Android). Base 18px; titles 24px; labels 16px; min 13px.
- Radius 16px cards, 14px buttons. Touch targets min 48px. Spacing 12-16px.

## Screens
1. Onboarding (language, name, PIN, add members)
2. Bahay: greeting, scan button, upcoming reminder cards, folder tiles
3. Scan + confirm (check and correct)
4. Pamilya: member status cards + "Gawin ngayong linggo"
5. Papeles: folders -> list -> document view
6. Tanong: chat bubbles, voice input, read-aloud, source link
7. Settings: language, text size, PIN, delete data

## Error handling
- No internet: queue scans; show "Kailangan ng internet" on Tanong.
- OCR failure or low confidence: ask to rescan with tips (more light, flat paper).
- Storage nearly full: warn and suggest deleting old duplicates.

## Testing
- Unit: rules engine, member matching, date parsing (Filipino/English months).
- Manual: test with real sample forms (redacted) on a low-end Android phone.
- Usability: 5 grantees or Parent Leaders complete scan, find, and ask tasks.
