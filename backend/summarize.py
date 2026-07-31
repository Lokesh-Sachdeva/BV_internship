import json
import os
import re
import sys
from typing import List

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_NAME = "sshleifer/distilbart-cnn-6-6" //350
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
TOKENIZER = None
MODEL = None

if hasattr(torch, "set_num_threads"):
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))


def load_model():
    global TOKENIZER, MODEL
    if TOKENIZER is None or MODEL is None:
        TOKENIZER = AutoTokenizer.from_pretrained(MODEL_NAME)
        MODEL = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME).to(DEVICE)
        MODEL.eval()
    return TOKENIZER, MODEL


def extract_keywords(text: str, limit: int = 8) -> List[str]:
    words = re.findall(r"[a-zA-Z]{3,}", text.lower())
    stop_words = {"this", "that", "with", "from", "have", "been", "were", "your", "about", "will", "could", "should", "into", "them", "their", "there", "than", "then"}
    keywords = [word for word in words if word not in stop_words]
    return list(dict.fromkeys(keywords))[:limit]


def summarize(text: str, top_n: int = 5) -> dict:
    if not text or not text.strip():
        return {"sentences": ["No readable content found."], "keywords": []}

    cleaned_text = re.sub(r"\s+", " ", text).strip()
    if len(cleaned_text) < 40:
        return {"sentences": [cleaned_text], "keywords": extract_keywords(cleaned_text)}

    try:
        tokenizer, model = load_model()
        inputs = tokenizer(
            cleaned_text,
            max_length=1024,
            truncation=True,
            return_tensors="pt",
        ).to(DEVICE)

        with torch.no_grad():
            summary_ids = model.generate(
                **inputs,
                max_new_tokens=max(20, min(50, max(12, len(cleaned_text) // 10))),
                min_length=8,
                num_beams=1,
                do_sample=False,
                early_stopping=True,
            )

        summary_text = tokenizer.decode(summary_ids[0], skip_special_tokens=True).strip()
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", summary_text) if s.strip()]
        if not sentences:
            sentences = [summary_text]
    except Exception as exc:
        print(f"[summarizer] local model failed: {exc}", file=sys.stderr)
        sentences = [cleaned_text[:400].strip()]

    return {"sentences": sentences[: max(1, top_n)], "keywords": extract_keywords(cleaned_text)}


def run_server():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            print(json.dumps({"sentences": ["Invalid request payload."], "keywords": []}))
            sys.stdout.flush()
            continue

        result = summarize(payload.get("text", ""), int(payload.get("top_n", 5)))
        print(json.dumps(result))
        sys.stdout.flush()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--serve":
        run_server()
    else:
        payload_text = sys.stdin.read().strip()
        if not payload_text:
            payload = {"text": "The quick brown fox jumps over the lazy dog. This is a short test for the local summarizer. It should produce a concise summary for the provided text.", "top_n": 3}
        else:
            payload = json.loads(payload_text)
        result = summarize(payload.get("text", ""), int(payload.get("top_n", 5)))
        print(json.dumps(result))
