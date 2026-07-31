
const BACKEND = 'http://localhost:3000';

// State elements 
const states = {
  empty: document.getElementById('state-empty'),
  loading: document.getElementById('state-loading'),
  error: document.getElementById('state-error'),
  summary: document.getElementById('state-summary'),
};

function showState(name) {
  Object.entries(states).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
}

// Status dot 

const statusDot = document.getElementById('status-dot');

async function checkBackend() {
  try {
    const res = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(2000) });
    statusDot.className = res.ok ? 'status-dot online' : 'status-dot offline';
    statusDot.title = res.ok ? 'Backend online' : 'Backend error';
  } catch {
    statusDot.className = 'status-dot offline';
    statusDot.title = 'Backend offline';
  }
}

// Render summary 

function renderSummary(data) {
  // document.getElementById('meta-subject').textContent = data.subject;
  // document.getElementById('meta-sender').textContent = data.sender;
  document.getElementById('meta-words').textContent = `${data.wordCount} words`;

  // Keywords

  const kw = document.getElementById('keywords');
  kw.innerHTML = '';
  (data.keywords || []).forEach((word, i) => {
    const chip = document.createElement('span');
    chip.className = 'keyword-chip';
    chip.textContent = word;
    chip.style.animationDelay = `${i * 0.05}s`;
    kw.appendChild(chip);
  });

  // Summary bullets
  const list = document.getElementById('summary-list');
  list.innerHTML = '';
  (data.summary || []).forEach(sentence => {
    const li = document.createElement('li');
    li.textContent = sentence;
    list.appendChild(li);
  });

  showState('summary');
}

// Summarise flow 

async function summarise(emailData) {
  showState('loading');

  try {
    const res = await fetch(`${BACKEND}/summarise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    renderSummary(data);

  } catch (err) {
    document.getElementById('error-msg').textContent =
      err.message.includes('fetch') || err.name === 'TimeoutError'
        ? 'Cannot reach backend. Make sure the Node server is running on port 3000.'
        : err.message;
    showState('error');
  }
}

// ─── Load email data from storage 
async function loadAndSummarise() {
  const btnRefresh = document.getElementById('btn-refresh');
  btnRefresh.classList.add('spinning');

  let freshEmailData = null;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        const check = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => { return !!window.__SUMMARIZER_INJECTED__; },
        });
        const present = check?.[0]?.result;
        if (!present) {
          console.log('[Summarizer][popup] scraper not present — injecting now');
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/scraper.js'] });
          await new Promise(r => setTimeout(r, 400));
        }
      } catch (err) {
        console.warn('[Summarizer][popup] scripting check/inject failed', err);
      }

      console.log('[Summarizer][popup] requesting scrape from tab', tab.id);
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_NOW', useSelection: false });
      console.log('[Summarizer][popup] scrape response', response);
      freshEmailData = response?.data || null;
    }
  } catch (err) {
    console.warn('[Summarizer][popup] tab query failed', err);
  }

  await new Promise(r => setTimeout(r, 600));

  btnRefresh.classList.remove('spinning');

  if (freshEmailData && freshEmailData.body) {
    summarise(freshEmailData);
    return;
  }

  chrome.storage.local.get('emailData', ({ emailData }) => {
    if (!emailData || !emailData.body) {
      document.getElementById('error-msg').textContent = 'No email content was detected. Open an email and try again.';
      showState('empty');
      return;
    }
    summarise(emailData);
  });
}

// ─── Copy summary 
document.getElementById('btn-copy').addEventListener('click', function () {
  const items = [...document.querySelectorAll('#summary-list li')].map(li => `• ${li.textContent}`);
  const text = `${items.join('\n')}`;

  navigator.clipboard.writeText(text).then(() => {
    this.textContent = '✓ Copied!';
    this.classList.add('copied');
    setTimeout(() => {
      this.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Summary`;
      this.classList.remove('copied');
    }, 2000);
  });
});

// ─── Buttons 
document.getElementById('btn-refresh').addEventListener('click', loadAndSummarise);
document.getElementById('btn-refresh-summary').addEventListener('click', loadAndSummarise);
document.getElementById('btn-retry').addEventListener('click', loadAndSummarise);

// ─── Init 
checkBackend();
loadAndSummarise();
