"""Dependency-free inference for the exported TF-IDF + logistic-regression models.

Reproduces scikit-learn's TfidfVectorizer (lowercase, sublinear tf, l2 norm) so the
deployed app needs no numpy/scikit-learn.
"""
import json
import math
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[1] / "model"
_TOKEN = re.compile(r"(?u)\b\w\w+\b")
_WS = re.compile(r"\s\s+")


def url_for_model(url: str) -> str:
    u = url.strip().lower()
    u = re.sub(r"^[a-z][a-z0-9+.-]*://", "", u)
    if u.startswith("www."):
        u = u[4:]
    return u.rstrip("/")


@lru_cache(maxsize=2)
def _load(kind: str) -> dict | None:
    path = MODEL_DIR / f"{kind}_model.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _word_terms(text: str, ngram: tuple[int, int]) -> list[str]:
    tokens = _TOKEN.findall(text.lower())
    terms = []
    for n in range(ngram[0], ngram[1] + 1):
        if n == 1:
            terms.extend(tokens)
        else:
            terms.extend(" ".join(tokens[i:i + n]) for i in range(len(tokens) - n + 1))
    return terms


def _char_terms(text: str, ngram: tuple[int, int]) -> list[str]:
    t = _WS.sub(" ", text.lower())
    terms = []
    for n in range(ngram[0], ngram[1] + 1):
        terms.extend(t[i:i + n] for i in range(len(t) - n + 1))
    return terms


def _score(model: dict, terms: list[str]) -> tuple[float, list[tuple[str, float]]]:
    feats = model["features"]
    counts = Counter(t for t in terms if t in feats)
    if not counts:
        return 1 / (1 + math.exp(-model["intercept"])), []
    weights = {t: (1 + math.log(c)) * feats[t][0] for t, c in counts.items()}
    norm = math.sqrt(sum(w * w for w in weights.values())) or 1.0
    contrib = {t: (w / norm) * feats[t][1] for t, w in weights.items()}
    z = model["intercept"] + sum(contrib.values())
    prob = 1 / (1 + math.exp(-max(min(z, 50), -50)))
    top = sorted(((t, c) for t, c in contrib.items() if c > 0), key=lambda x: -x[1])[:6]
    return prob, top


def predict_text(text: str) -> dict | None:
    model = _load("text")
    if model is None or not text.strip():
        return None
    prob, top = _score(model, _word_terms(text, tuple(model["ngram_range"])))
    return {"probability": round(prob, 4), "top_terms": [t for t, _ in top]}


def predict_url(url: str) -> dict | None:
    model = _load("url")
    if model is None or not url.strip():
        return None
    prob, top = _score(model, _char_terms(url_for_model(url), tuple(model["ngram_range"])))
    return {"probability": round(prob, 4), "top_terms": [t.strip() for t, _ in top if t.strip()]}
