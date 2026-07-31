# 📬 MailSnap — Outlook Web Summariser

A Chrome extension that **automatically scrapes** your open Outlook email and gives you a **TextRank summary** with one click. No AI API. No cloud. Runs 100% locally.

---

## Project Structure

```
outlook-summarizer/
├── extension/          ← Load this folder in Chrome
│   ├── manifest.json
│   ├── icons/
│   ├── popup/          ← UI (HTML + CSS + JS)
│   ├── content/        ← DOM scraper (runs on Outlook pages)
│   └── background/     ← Service worker (minimal)
└── backend/            ← Node + Express
    ├── server.js       ← POST /summarise
    └── summarizer.js   ← TextRank (zero extra deps)
```

---

## Setup

### 1 — Backend

```bash
cd backend
npm install
node server.js
# → Running at http://localhost:3000
```

### 2 — Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Pin the extension from the toolbar

---

## How It Works

```
Outlook page loads
      ↓
Content script (scraper.js) attaches MutationObserver
      ↓
Email detected → subject + sender + body saved to chrome.storage.session
      ↓
User clicks extension icon
      ↓
Popup reads storage → POST /summarise → TextRank runs
      ↓
Summary bullets + keywords displayed
```

---

## TextRank Algorithm (no external deps)

1. **Split** email body into sentences
2. **Tokenise** each sentence (remove stop-words)
3. **Jaccard similarity** matrix between all sentence pairs
4. **PageRank** (30 iterations, damping = 0.85) scores each sentence
5. **Top-N** sentences returned in original reading order

---

## Supported Outlook Versions

| Version | URL |
|---|---|
| Outlook Personal | `outlook.live.com` |
| Office 365 | `outlook.office.com` |
| Office 365 (alt) | `outlook.office365.com` |

---

## Notes

- The backend must be running (`node server.js`) before clicking the extension.
- The status dot in the popup header shows green = backend online, red = offline.
- If an email isn't detected, click the **↻ refresh** button after opening the email.
