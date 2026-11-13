# Requirements Document

## Introduction
Sobre helps 4Ps households keep, understand, and act on their program papers.
The MVP covers three jobs: scan-and-file, family compliance tracking with
reminders, and plain-language explanations. It uses Lumen OCR and Lumen AI Chat.

## Requirements

### Requirement 1: Household setup
**User Story:** As a 4Ps grantee, I want to add my family members once, so that
my papers and reminders are sorted per person.
#### Acceptance Criteria
1. WHEN the user opens the app for the first time THEN the system SHALL ask for language (Tagalog or English), the grantee's first name, and a 4-digit app PIN.
2. WHEN the user adds a member THEN the system SHALL ask for first name, birth date, and role (grantee, child, pregnant member, other).
3. WHEN a member's birth date is saved THEN the system SHALL compute which program conditions apply (school, health check-up, deworming, prenatal, FDS).
4. The system SHALL NOT ask for or store the cash card PIN.

### Requirement 2: Scan and improve the photo
**User Story:** As a grantee, I want to take a clear photo of a paper, so that it is readable even if my phone camera is basic.
#### Acceptance Criteria
1. WHEN the user taps "I-scan ang Papel" THEN the system SHALL open the rear camera with a page outline guide.
2. WHEN a photo is taken THEN the system SHALL auto-crop, straighten, and raise contrast.
3. IF the photo is too blurry or dark THEN the system SHALL say so in plain words and offer "I-scan Ulit".
4. The system SHALL also accept an image or PDF upload from the phone.

### Requirement 3: AI reads and files the paper
**User Story:** As a grantee, I want the app to read the paper for me, so that I do not have to type anything.
#### Acceptance Criteria
1. WHEN a scan is accepted THEN the system SHALL send it to Lumen OCR and extract the text.
2. WHEN text is extracted THEN the system SHALL use Lumen AI Chat to identify document type, family member, document date, and key details (e.g., amount, due date, venue).
3. WHEN the type is identified THEN the system SHALL suggest a folder: Eskwela, Kalusugan, FDS, Payout, ID at Membership, or Abiso (notices).
4. IF the system is not sure of a field THEN it SHALL mark that field "Hindi sigurado" for the user to check.

### Requirement 4: Check and correct
**User Story:** As a grantee, I want to check what the AI read before saving, so that my records are correct.
#### Acceptance Criteria
1. WHEN extraction finishes THEN the system SHALL show the photo and each detected field with an "Ayusin" (edit) button.
2. WHEN the user edits a field THEN the system SHALL save the corrected value and record that it was corrected.
3. WHEN the user taps "Tama, I-save" THEN the system SHALL store the document in the chosen folder, tied to the member and date.

### Requirement 5: Folders and timeline
**User Story:** As a grantee, I want to find any paper quickly, so that I can show it when asked.
#### Acceptance Criteria
1. The system SHALL show folders as large icon tiles with a word label and a count.
2. WHEN a folder is opened THEN the system SHALL list papers newest first, with member name and date.
3. The system SHALL allow filtering by family member and searching by keyword.
4. WHEN a paper is opened THEN the system SHALL show the full photo with zoom.

### Requirement 6: Family compliance tracker
**User Story:** As a grantee, I want to see who in my family is at risk of missing a condition, so that I can act before payout is affected.
#### Acceptance Criteria
1. The system SHALL show one card per member with status: "Ayos" (green, check icon), "Malapit" (yellow, ! icon, due within 7 days), or "Kulang" (red, x icon, overdue).
2. The system SHALL compute status from saved papers and dates the user logs (e.g., check-up done, FDS attended).
3. The rules SHALL be read from a configurable rules file so they can be updated when DSWD guidelines change.
4. WHEN any member is "Malapit" or "Kulang" THEN the home screen SHALL show a "Gawin ngayong linggo" (do this week) card.

### Requirement 7: Reminders
**User Story:** As a grantee, I want reminders for FDS, check-ups, deworming, and payout, so that I do not miss them.
#### Acceptance Criteria
1. WHEN a paper with a future date is saved (FDS schedule, payout notice, check-up) THEN the system SHALL offer to create a reminder.
2. The system SHALL remind 3 days before and on the morning of the event, by default.
3. The system SHALL let the user add a reminder to their phone calendar (.ics download or Google Calendar link).
4. Each reminder SHALL include a "Dalhin" (what to bring) list, e.g., 4Ps ID and cash card for payout.

### Requirement 8: Ask and explain (Tanong)
**User Story:** As a grantee, I want to ask questions about my papers in my own words, so that I understand what they mean and what to do.
#### Acceptance Criteria
1. WHEN the user asks a question THEN the system SHALL answer in short, plain Tagalog (or English if chosen), using Lumen AI Chat with the user's saved papers as context.
2. Each answer SHALL show which saved paper it came from, with a "Tingnan" link.
3. Each answer SHALL have a "Pakinggan" (read aloud) button.
4. IF the answer needs an official decision (e.g., delisting, appeal) THEN the system SHALL tell the user to contact their City/Municipal Link.
5. The system SHALL allow voice input where the browser supports it.

### Requirement 9: Privacy and offline use
**User Story:** As a grantee who may share a phone, I want my papers protected, so that others cannot see them.
#### Acceptance Criteria
1. The system SHALL require the app PIN on open and after 5 minutes idle.
2. The system SHALL store documents on the device by default and SHALL NOT keep copies on the server after processing.
3. WHEN offline THEN the system SHALL still open folders, papers, the tracker, and reminders; scanning and Tanong SHALL queue or show a clear "Kailangan ng internet" message.
4. The system SHALL let the user delete any paper or all data.
