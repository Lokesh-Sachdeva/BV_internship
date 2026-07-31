const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanText, buildEmailData, pickBestCandidate, shouldUpdateEmailData } = require('../../extension/content/scraper-utils');

test('buildEmailData cleans and preserves the visible email body', () => {
    const data = buildEmailData({
        subjectEl: { innerText: '   Weekly update   ' },
        senderEl: { innerText: '  Alice Smith  ' },
        bodyEl: { innerText: 'First paragraph\n\nSecond paragraph' },
        dateEl: { innerText: 'Today' },
    });

    assert.equal(data.subject, 'Weekly update');
    assert.equal(data.sender, 'Alice Smith');
    assert.equal(data.body, 'First paragraph Second paragraph');
    assert.equal(data.date, 'Today');
});

test('buildEmailData uses selection text when provided', () => {
    const data = buildEmailData({
        subjectEl: { innerText: 'Hello' },
        senderEl: { innerText: 'Bob' },
        bodyEl: { innerText: 'Full email body' },
        dateEl: { innerText: 'Now' },
        selectionText: 'Selected snippet',
    });

    assert.equal(data.body, 'Selected snippet');
    assert.equal(data.subject, 'Hello');
});

test('pickBestCandidate prefers header-like subject text over generic UI labels', () => {
    const subject = pickBestCandidate([
        { innerText: 'Inbox', title: 'Inbox', parentElement: { className: 'toolbar' } },
        { innerText: 'Quarterly planning', title: 'Quarterly planning', parentElement: { className: 'subjectHeader' } },
    ], 'subject');

    assert.equal(subject.innerText, 'Quarterly planning');
});

test('shouldUpdateEmailData detects body changes even when the subject stays the same', () => {
    const previous = { subject: 'Project update', sender: 'Alice', body: 'Old body text', date: 'Today' };
    const next = { subject: 'Project update', sender: 'Alice', body: 'New body text', date: 'Today' };

    assert.equal(shouldUpdateEmailData(previous, next), true);
    assert.equal(shouldUpdateEmailData(next, next), false);
});

test('pickBestCandidate ignores inbox list-row content when selecting the subject', () => {
    const subject = pickBestCandidate([
        {
            innerText: 'Project update for the team that appears in the message list row of the mailbox view',
            title: 'Project update for the team that appears in the message list row of the mailbox view',
            parentElement: { className: 'messageListItem' },
        },
        {
            innerText: 'Quarterly planning',
            title: 'Quarterly planning',
            parentElement: { className: 'subjectHeader' },
        },
    ], 'subject');

    assert.equal(subject.innerText, 'Quarterly planning');
});
