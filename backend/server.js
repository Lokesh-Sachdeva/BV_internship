const express = require('express');
const cors = require('cors');
const { summarise } = require('./summarizer');
// const { fetchLatestMail, hasImapCredentials } = require('./imap');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── POST /summarise 

app.post('/summarise', (req, res) => {
  const { subject, sender, body, date } = req.body;

  if (!body || body.length < 20) {
    return res.status(400).json({ error: 'Email body is too short to summarise.' });
  }

  const topN = Math.min(5, Math.max(3, Math.floor(body.split(' ').length / 80)));
  const result = summarise(body, topN);

  res.json({
    subject: subject || '(no subject)',
    sender: sender || 'Unknown sender',
    date: date || '',
    summary: result.sentences,
    keywords: result.keywords,
    wordCount: body.split(/\s+/).length,
  });
});

// ─── GET /health 

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/mail/latest', async (_req, res) => {
  if (!hasImapCredentials()) {
    return res.status(503).json({ error: 'IMAP is not configured. Set IMAP_USER and IMAP_PASS in the environment.' });
  }

  if (!Number.isInteger(PORT) || PORT <= 0) {
    return res.status(500).json({ error: 'Invalid port configuration.' });
  }

  try {
    const mail = await fetchLatestMail();
    if (!mail || !mail.body) {
      return res.status(404).json({ error: 'No mail found.' });
    }

    res.json(mail);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch mail.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Outlook Summariser backend running at http://localhost:${PORT}\n`);
});
