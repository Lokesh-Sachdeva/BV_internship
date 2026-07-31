const { execFileSync } = require('child_process');
const path = require('path');

function summarise(text, topN = 5) {
  const scriptPath = path.join(__dirname, 'summarize.py');
  const payload = JSON.stringify({ text, top_n: topN });

  try {
    const output = execFileSync('python', [scriptPath], {
      input: payload,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1' },
      shell: false,
    });

    return JSON.parse(output);
  } catch (error) {
    console.error('[summarizer] Python summarizer failed:', error.message);
    return {
      sentences: ['Unable to summarise content right now.'],
      keywords: [],
    };
  }
}

module.exports = { summarise };
