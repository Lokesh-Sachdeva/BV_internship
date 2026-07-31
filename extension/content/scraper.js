/**
 * scraper.js — Content Script
 * Runs on Outlook Web pages. Watches for email opens via MutationObserver,
 * scrapes subject / sender / body, and saves to chrome.storage.local.
 */

console.log('[Summarizer] content script loaded');
try { window.__SUMMARIZER_INJECTED__ = true; } catch (_) { }

const utils = (typeof window !== 'undefined' && window.SummarizerUtils)
  ? window.SummarizerUtils
  : (typeof require === 'function' ? require('./scraper-utils') : null);

const pickBestCandidate = utils?.pickBestCandidate || ((candidates = []) => candidates[0] || null);
const buildEmailData = utils?.buildEmailData || ((options = {}) => ({
  subject: '',
  sender: '',
  body: '',
  date: '',
  scrapedAt: Date.now(),
  ...options,
}));
const findBestBodyElement = utils?.findBestBodyElement || ((selectors, root = document) => {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch (_) { }
  }
  return null;
});
const cleanText = utils?.cleanText || ((text = '') => String(text || '').replace(/\s+/g, ' ').trim());
const shouldUpdateEmailData = utils?.shouldUpdateEmailData || ((previous = null, next = null) => JSON.stringify(previous || {}) !== JSON.stringify(next || {}));

// Selector Banks 

// Outlook changes class names often; we try multiple selectors and take first hit.

const SUBJECT_SELECTORS = [
  '[data-testid="subject"]',
  '[data-testid="conversation-subject"]',
  '[data-testid="mailSubject"]',
  '[aria-label*="subject" i]',
  '[aria-label*="message subject" i]',
  'span[class*="subject" i]',
  'div[class*="subject" i]',
  '[class*="subject" i] span',
  '[class*="subject" i] div',
  '[role="heading"]',
];

const SENDER_SELECTORS = [
  '[data-testid="senderName"]',
  '[data-testid="fromContact"]',
  '[aria-label*="from" i]',
  '[aria-label*="sender" i]',
  '[class*="senderName" i]',
  '[class*="sender" i] [class*="name" i]',
  '[class*="from" i] [class*="name" i]',
  'span[class*="from" i]',
  'div[class*="from" i]',
];

const BODY_SELECTORS = [
  // Most reliable across both Outlook versions
  '[role="document"]',
  '[aria-label="Message body"]',
  '[aria-label*="email body" i]',
  '[aria-label*="message body" i]',
  '[data-testid="message-body"]',
  '[data-testid="readPaneBody"]',
  // Outlook.com reading pane
  'div[class*="readingPane" i] [class*="body" i]',
  'div[class*="readingPane" i] div',
  // Office 365 / modern Outlook
  'div[class*="ItemBody" i]',
  'div[class*="messageBody" i]',
  'div[class*="readPane" i]',
  'div[class*="mailBody" i]',
  'div[class*="bodyContent" i]',
  // Generic fallback – widest net
  '[class*="ReadingPaneContent" i]',
  'div[aria-label*="message" i]',
  'div[aria-label*="email" i]',
];

const DATE_SELECTORS = [
  '[data-testid="receivedDateTime"]',
  '[data-testid="mailDate"]',
  '[aria-label*="sent" i]',
  '[aria-label*="received" i]',
  '[title*="sent" i]',
  '[title*="received" i]',
  'span[class*="date" i]',
  'div[class*="date" i]',
  '[datetime]',
  'time',
];

// ─── Helpers 

function queryFirst(selectors, root = document, preferredType = 'subject') {
  const matches = [];
  for (const sel of selectors) {
    try {
      const elements = Array.from(root.querySelectorAll(sel));
      elements.forEach((el) => {
        const text = cleanText(el.innerText || el.textContent || '');
        if (text) matches.push(el);
      });
    } catch (_) {
      // bad selector — skip
    }
  }

  return pickBestCandidate(matches, preferredType);
}

// ─── Scrape 

function scrapeEmail() {
  const subjectEl = queryFirst(SUBJECT_SELECTORS, document, 'subject');
  const senderEl = queryFirst(SENDER_SELECTORS, document, 'sender');
  const bodyEl = findBestBodyElement(BODY_SELECTORS);
  const dateEl = queryFirst(DATE_SELECTORS, document, 'date');

  const data = buildEmailData({ subjectEl, senderEl, bodyEl, dateEl });

  // Must have at least a body to be worth storing
  if (!data.body || data.body.length < 30) return null;

  return data;
}

function isExtensionContextValid() {
  try {
    return !!(chrome?.runtime?.id);
  } catch (_) {
    return false;
  }
}

function isInvalidatedContextError(error) {
  const message = error?.message || String(error || '');
  return /invalidated|context/i.test(message);
}

function saveToStorage(data) {
  if (!data || !data.body || data.body.length < 30) {
    return;
  }

  const persist = () => {
    if (!chrome?.storage?.local) {
      console.warn('[Summarizer] skipping storage write because chrome.storage.local is unavailable');
      return;
    }

    try {
      chrome.storage.local.set({ emailData: data }, () => {
        try {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || 'unknown storage error';
            if (isInvalidatedContextError(errMsg)) {
              console.warn('[Summarizer] storage write skipped because the extension context was invalidated');
            } else {
              console.warn('[Summarizer] storage.set failed', errMsg);
            }
          } else {
            console.log('[Summarizer] Email data saved:', data.subject, 'words=', (data.body || '').length);
          }
        } catch (callbackErr) {
          console.warn('[Summarizer] storage callback exception', callbackErr);
        }
      });
    } catch (err) {
      if (isInvalidatedContextError(err)) {
        console.warn('[Summarizer] extension context invalidated; storage update skipped');
      } else {
        console.warn('[Summarizer] storage.set exception', err);
      }
    }
  };

  if (!isExtensionContextValid()) {
    console.warn('[Summarizer] extension context unavailable; retrying once after a short delay');
    setTimeout(persist, 500);
    return;
  }

  persist();
}

// ─── Observer 
let debounceTimer = null;
let lastSnapshot = null;

function handleMutation() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const data = scrapeEmail();
    if (!data) return;

    const shouldUpdate = shouldUpdateEmailData(lastSnapshot, data);
    if (shouldUpdate) {
      lastSnapshot = data;
      saveToStorage(data);
    }
  }, 800); // wait for Outlook to finish rendering
}

let observer = null;

function startObserver() {
  if (!document.body) return;
  observer = new MutationObserver(handleMutation);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) {
  startObserver();
} else {
  window.addEventListener('load', startObserver, { once: true });
}

// Also try immediately in case the page already has an email open
setTimeout(() => {
  const data = scrapeEmail();
  if (data) {
    lastSnapshot = data;
    saveToStorage(data);
  }
}, 2000);
// ─── Message listener (popup can request a fresh scrape) 
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCRAPE_NOW') {
    let data = null;

    // If caller requested selected text, prefer that as the body
    if (msg.useSelection) {
      try {
        const sel = window.getSelection && window.getSelection().toString();
        const cleaned = cleanText(sel || '');
        if (cleaned && cleaned.length >= 20) {
          const subjectEl = queryFirst(SUBJECT_SELECTORS, document, 'subject');
          const senderEl = queryFirst(SENDER_SELECTORS, document, 'sender');
          const bodyEl = findBestBodyElement(BODY_SELECTORS);
          const dateEl = queryFirst(DATE_SELECTORS, document, 'date');
          data = buildEmailData({ subjectEl, senderEl, bodyEl, dateEl, selectionText: cleaned });
        }
      } catch (_) { /* ignore selection errors */ }
    }

    // If no selection or not requested, do a normal scrape
    if (!data) {
      data = scrapeEmail();
    }

    if (data) saveToStorage(data);
    sendResponse({ ok: true, data });
  }
  return true;
});
