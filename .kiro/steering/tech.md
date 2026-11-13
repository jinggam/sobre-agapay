# Tech

- Frontend: React + TypeScript + Vite, built as a PWA (installable, offline shell).
- Styling: Tailwind CSS using the design tokens in design.md.
- Local storage: IndexedDB via Dexie (documents, members, reminders). Images
  compressed to max 1600px, JPEG ~0.7 quality.
- AI: Lumen OCR (read text from images/PDFs) and Lumen AI Chat (explain,
  classify, answer). Call them through a small server proxy so API keys never
  reach the browser.
- Server proxy: Node (Express) or serverless functions. No user documents are
  stored server-side.
- Read-aloud: Web Speech API (speechSynthesis), lang "fil-PH", fallback "en-PH".
- Notifications: in-app reminder list + Web Notifications; calendar export as
  .ics file and "Add to Google Calendar" link.
- Target devices: Android phones with Chrome, including older/low-RAM devices.
  Keep the JS bundle small; lazy-load the camera and chat screens.
