# Implementation Plan

- [x] 1. Project setup
  - Vite + React + TypeScript + Tailwind; PWA manifest and service worker
  - Add design tokens to Tailwind config; bottom tab layout (Bahay, Pamilya, Papeles, Tanong)
  - _Requirements: 9.3_

- [x] 2. Local database
  - Dexie schema for Household, Member, Document, Event, Reminder
  - _Requirements: 1, 5, 9.2_

- [x] 3. Onboarding and PIN lock
  - Language, grantee name, PIN, add members; idle lock after 5 minutes
  - _Requirements: 1.1-1.4, 9.1_

- [ ] 4. Proxy API
  - /api/read (Lumen OCR + Lumen AI Chat JSON extraction)
  - /api/ask (Lumen AI Chat with document context)
  - Keys in environment variables; do not persist uploads
  - _Requirements: 3.1-3.2, 8.1, 9.2_

- [x] 5. Scan flow
  - Camera capture with page guide, file/PDF upload
  - Canvas crop, deskew, contrast; blur/dark check
  - _Requirements: 2.1-2.4_

- [x] 6. Check-and-correct screen
  - Show photo + fields with "Ayusin"; flag "Hindi sigurado"; save to folder
  - _Requirements: 3.3-3.4, 4.1-4.3_

- [x] 7. Folders and document view
  - Icon tiles with counts, list newest first, member filter, search, zoom
  - _Requirements: 5.1-5.4_

- [x] 8. Rules engine and family tracker
  - Load rules.json; compute Ayos/Malapit/Kulang per member
  - "Gawin ngayong linggo" card on Bahay
  - _Requirements: 1.3, 6.1-6.4_

- [x] 9. Reminders
  - Create from saved papers; default 3 days before + morning of
  - Web Notifications; .ics export; Google Calendar link; "Dalhin" list
  - _Requirements: 7.1-7.4_

- [x] 10. Tanong (Ask)
  - Chat UI, voice input, answer with source link, read-aloud
  - Referral message for official decisions
  - _Requirements: 8.1-8.5_

- [x] 11. Settings and data control
  - Language, text size, change PIN, delete paper / delete all
  - _Requirements: 9.4_

- [ ] 12. Demo data and testing
  - Seed a sample household (Aling Rosa + 3 children) with redacted sample papers
  - Unit tests for rules engine and date parsing; test on low-end Android
