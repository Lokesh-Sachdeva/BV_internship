/**
 * background.js — Service Worker
 * Handles keyboard shortcuts and icon clicks for summarizing the current email.
 */

async function triggerSummarizeForActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
      const check = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => !!window.__SUMMARIZER_INJECTED__,
      });
      const present = check?.[0]?.result;
      if (!present) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/scraper.js'],
        });
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } catch (err) {
      console.warn('[Summarizer][background] scripting check/inject failed', err);
    }

    await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_NOW', useSelection: false });

    try {
      if (typeof chrome.action.openPopup === 'function') {
        await chrome.action.openPopup();
      }
    } catch (err) {
      console.warn('[Summarizer][background] could not open popup', err);
    }
  } catch (err) {
    console.warn('[Summarizer][background] summarize trigger failed', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'summarize-current-email-menu',
    title: 'Summarize Outlook email',
    contexts: ['page', 'selection'],
    documentUrlPatterns: [
      'https://outlook.live.com/*',
      'https://outlook.office.com/*',
      'https://outlook.office365.com/*',
    ],
  });
  console.log('[Summarizer] Extension installed.');
});

chrome.action.onClicked.addListener(() => {
  triggerSummarizeForActiveTab();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'summarize-current-email-menu') {
    triggerSummarizeForActiveTab();
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'summarize-current-email') {
    triggerSummarizeForActiveTab();
  }
});
