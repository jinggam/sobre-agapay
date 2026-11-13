# Sobre Agapay
1. Problem statement
Pantawid Pamilyang Pilipino Program (4Ps) households must keep proving that they meet program conditions: children attending school, health center visits, deworming, prenatal checkups, and monthly Family Development Sessions (FDS). They also receive payout slips, notices, and updating forms throughout the year.
Most of these records are on paper. They get lost, wet, torn, or mixed up, and many are written in English or official language that is hard to understand. When a document is missing or a condition is missed, families may get a lower grant, a suspension notice, or delays in payout, often without fully understanding why.
In one sentence: 4Ps families lose money and access to support because their program papers are easy to lose, hard to understand, and hard to keep track of.

2. People who will benefit
Low-income Filipino households who depend on government social programs and handle paperwork with limited literacy, limited time, and no safe place to store documents. This includes 4Ps, social pension, AICS, and other assistance beneficiaries.
Specific group (primary users)
4Ps grantees, usually the mother, who manages compliance for several children and attends FDS. Their older children or relatives who often help read and organize papers on a shared phone.
Secondary beneficiaries
Parent Leaders, who help group members stay compliant.
City/municipal links and barangay staff, who spend time on follow-ups, lost documents, and grievances that better records could prevent.

3. Minimum viable product (MVP)
The MVP focuses on three things done well: keep the papers safe, show what is due, and explain things simply.

Scan and auto-file - Take a photo of any 4Ps paper. The app improves the image, reads the form title, date, and family member name, then files it in the right folder (Education, Health, FDS, Payout, Notices, IDs).
Check and correct -After scanning, the user sees what the AI read and can confirm or fix it with one tap before saving.
Family dashboard - One home screen with big folder buttons and a status for each family member: complete, due soon, or missing.
Reminders - Alerts for FDS sessions, health center visits, school compliance periods, and payout dates, plus a “what to bring” checklist (e.g., ID and cash card for payout). Optional sync to phone calendar.
Explain this paper - Tap any saved document and ask what it means. The app explains in simple Filipino, with a read-aloud button.

The app uses Lumen OCR to read uploaded document images or PDFs, then Lumen AI Chat to extract details; the Tanong feature also uses Lumen AI Chat to answer questions based on saved document text in Tagalog or English. To run it on Windows, open PowerShell in the project folder, run npm install and Copy-Item .env.example .env, add valid Lumen URLs and API keys to .env, then run npm run server in one terminal and npm run dev in another; open the URL Vite prints. Since the sample keys were published on GitHub, rotate them before use and never commit .env.
