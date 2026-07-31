(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.SummarizerUtils = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function cleanText(text = '') {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function queryFirst(selectors, root = document) {
        for (const sel of selectors) {
            try {
                const el = root.querySelector(sel);
                if (el) {
                    const text = cleanText(el.innerText || el.textContent || '');
                    if (text) return el;
                }
            } catch (_) {
                // ignore invalid selectors
            }
        }
        return null;
    }

    function getContextText(el) {
        if (!el) return '';
        const parts = [];
        let current = el;
        for (let i = 0; current && i < 5; i += 1) {
            parts.push(cleanText(current.getAttribute?.('aria-label') || current.getAttribute?.('data-testid') || current.className || current.id || ''));
            current = current.parentElement;
        }
        return parts.join(' ').toLowerCase();
    }

    function isLikelyHeaderCandidate(el, preferredType = 'subject') {
        const text = cleanText(el?.innerText || el?.textContent || '');
        const title = cleanText(el?.title || '');
        const context = `${text} ${title} ${getContextText(el)}`.toLowerCase();
        const className = cleanText(el?.className || '');
        const parentClassName = cleanText(el?.parentElement?.className || '');

        if (!text || text.length < 2 || text.length > 220) return false;

        if (/\b(inbox|sent|drafts|archive|search|filter|settings|notifications|compose|reply|forward|new message|write|help|calendar|people|contacts|teams|files|meet|chat|outlook)\b/i.test(text)) {
            return false;
        }

        if (/message(?:[-_ ]?list|listitem)|mail(?:[-_ ]?list)|conversation(?:[-_ ]?list)|thread(?:[-_ ]?list)|folder(?:[-_ ]?list)|list-item|item-row|thread-list|folder-list/i.test(className) || /message(?:[-_ ]?list|listitem)|mail(?:[-_ ]?list)|conversation(?:[-_ ]?list)|thread(?:[-_ ]?list)|folder(?:[-_ ]?list)|list-item|item-row|thread-list|folder-list/i.test(parentClassName)) {
            return false;
        }

        if (preferredType === 'subject') {
            if (/\b(sender|from|to|cc|bcc)\b/i.test(context)) return false;
            return true;
        }

        if (preferredType === 'sender') {
            if (/\b(subject|message subject|conversation subject|mail subject)\b/i.test(context)) return false;
            return text.length <= 120 && (text.includes('@') || text.includes(' ') || /[A-Z][a-z]/.test(text));
        }

        return true;
    }

    function pickBestCandidate(candidates = [], preferredType = 'subject') {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;

        const scored = candidates
            .map((el) => {
                const text = cleanText(el?.innerText || el?.textContent || '');
                const title = cleanText(el?.title || '');
                const context = `${text} ${title} ${getContextText(el)}`.toLowerCase();
                const className = cleanText(el?.className || '');
                const parentClassName = cleanText(el?.parentElement?.className || '');
                const isHeaderLike = isLikelyHeaderCandidate(el, preferredType);
                const hasMarker = /subject|sender|from|message|mail|conversation/i.test(context);
                const length = Math.min(text.length, 120);
                const isInboxListNode = /message(?:[-_ ]?list|listitem)|mail(?:[-_ ]?list)|conversation(?:[-_ ]?list)|thread(?:[-_ ]?list)|folder(?:[-_ ]?list)|list-item|item-row|thread-list|folder-list/i.test(className) || /message(?:[-_ ]?list|listitem)|mail(?:[-_ ]?list)|conversation(?:[-_ ]?list)|thread(?:[-_ ]?list)|folder(?:[-_ ]?list)|list-item|item-row|thread-list|folder-list/i.test(parentClassName);
                const score = (isHeaderLike ? 80 : 0) + (hasMarker ? 25 : 0) + length - (isInboxListNode ? 200 : 0);
                return { el, text, score };
            })
            .filter(({ el, text }) => el && isLikelyHeaderCandidate(el, preferredType) && text && text.length >= 2)
            .sort((a, b) => b.score - a.score);

        const best = scored[0];
        if (!best) return null;
        return best.el;
    }

    function getTextFromElement(el) {
        if (!el) return '';
        return cleanText(el.innerText || el.textContent || '');
    }

    function normalizeEmailBody(text = '') {
        return cleanText(text)
            .replace(/\b(?:from|to|cc|subject|date)\s*:/gi, '')
            .replace(/\n/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function buildEmailData({
        subjectEl = null,
        senderEl = null,
        bodyEl = null,
        dateEl = null,
        selectionText = '',
    } = {}) {
        const subject = cleanText(subjectEl?.innerText || subjectEl?.textContent || '');
        const sender = cleanText(senderEl?.innerText || senderEl?.textContent || '');
        const rawBody = selectionText
            ? cleanText(selectionText)
            : getTextFromElement(bodyEl);
        const body = normalizeEmailBody(rawBody);
        const date = cleanText(dateEl?.getAttribute?.('datetime') || dateEl?.innerText || dateEl?.textContent || '');

        return {
            subject,
            sender,
            body,
            date,
            scrapedAt: Date.now(),
        };
    }

    function findBestBodyElement(selectors, root = document) {
        const preferred = queryFirst(selectors, root);
        if (preferred) return preferred;

        const elements = Array.from(root.querySelectorAll('div, section, article, p'));
        const scored = elements
            .map((el) => ({ el, text: getTextFromElement(el) }))
            .filter(({ text }) => text.length >= 80)
            .sort((a, b) => b.text.length - a.text.length);

        return scored[0]?.el || null;
    }

    function shouldUpdateEmailData(previous = null, next = null) {
        if (!previous) return !!next;
        if (!next) return false;

        const normalizedPrevious = {
            subject: cleanText(previous.subject || ''),
            sender: cleanText(previous.sender || ''),
            body: cleanText(previous.body || ''),
            date: cleanText(previous.date || ''),
        };
        const normalizedNext = {
            subject: cleanText(next.subject || ''),
            sender: cleanText(next.sender || ''),
            body: cleanText(next.body || ''),
            date: cleanText(next.date || ''),
        };

        return JSON.stringify(normalizedPrevious) !== JSON.stringify(normalizedNext);
    }

    return {
        cleanText,
        queryFirst,
        pickBestCandidate,
        buildEmailData,
        findBestBodyElement,
        shouldUpdateEmailData,
    };
});
