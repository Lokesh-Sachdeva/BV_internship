import json
import re
import sys
from typing import List

import nltk
from nltk.tokenize import sent_tokenize
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer

nltk.download('punkt', quiet=True)


def summarize(text: str, top_n: int = 5) -> dict:
    if not text or not text.strip():
        return {"sentences": ["No readable content found."], "keywords": []}

    sentences = [s.strip() for s in sent_tokenize(text) if len(s.strip()) > 15]
    if not sentences:
        return {"sentences": ["No readable content found."], "keywords": []}

    parser = PlaintextParser.from_string(text, Tokenizer("english"))
    summarizer = LsaSummarizer()
    summary_sentences = summarizer(parser.document, top_n if top_n > 0 else 1)
    summary_texts = [str(sentence) for sentence in summary_sentences]

    if not summary_texts:
        summary_texts = sentences[: min(top_n if top_n > 0 else 1, len(sentences))]

    keywords = []
    for word in re.findall(r"[a-zA-Z]{3,}", text.lower()):
        if word not in {"this", "that", "with", "from", "have", "been", "were", "your", "about"}:
            keywords.append(word)
    keywords = keywords[:8]

    return {"sentences": summary_texts, "keywords": keywords}


if __name__ == "__main__":
    payload_text = sys.stdin.read().strip()
    payload = json.loads(payload_text if payload_text else '{}')
    result = summarize(payload.get("text", ""), int(payload.get("top_n", 5)))
    print(json.dumps(result))
