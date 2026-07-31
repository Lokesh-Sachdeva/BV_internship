const { spawn } = require('child_process');
const path = require('path');

let child = null;
let ready = false;
let pending = [];

function ensureWorker() {
  if (child) return child;

  const scriptPath = path.join(__dirname, 'summarize.py');
  child = spawn('python', [scriptPath, '--serve'], {
    cwd: __dirname,
    env: { ...process.env, PYTHONUTF8: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/).filter(Boolean);
    while (lines.length > 0) {
      const line = lines.shift();
      const item = pending.shift();
      if (item) {
        item.resolve(JSON.parse(line));
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    console.error('[summarizer] worker stderr:', chunk.toString());
  });

  child.on('exit', (code) => {
    console.warn(`[summarizer] worker exited with code ${code}`);
    child = null;
    ready = false;
  });

  ready = true;
  return child;
}

function summarise(text, topN = 5) {
  const payload = JSON.stringify({ text, top_n: topN });

  try {
    const worker = ensureWorker();
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      worker.stdin.write(`${payload}\n`);
    });
  } catch (error) {
    console.error('[summarizer] Python summarizer failed:', error.message);
    return Promise.resolve({
      sentences: ['Unable to summarise content right now.'],
      keywords: [],
    });
  }
}

module.exports = { summarise };
