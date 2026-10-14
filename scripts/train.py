"""Train the text and URL models and export them as JSON for dependency-free inference.

Usage: .venv/bin/python scripts/train.py
"""
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support, roc_auc_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.analyzer.ml import url_for_model  # noqa: E402

RAW = ROOT / "data" / "raw"
MODEL_DIR = ROOT / "app" / "model"
EVAL_DIR = ROOT / "data" / "eval"
SEED = 42


def metrics(y_true, prob, threshold=0.5) -> dict:
    pred = (prob >= threshold).astype(int)
    p, r, f, _ = precision_recall_fscore_support(y_true, pred, average="binary")
    tn, fp, fn, tp = confusion_matrix(y_true, pred).ravel()
    return {
        "n": int(len(y_true)), "precision": round(float(p), 4), "recall": round(float(r), 4), "f1": round(float(f), 4),
        "roc_auc": round(float(roc_auc_score(y_true, prob)), 4), "accuracy": round(float((tp + tn) / len(y_true)), 4),
        "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
        "false_positive_rate": round(float(fp / (fp + tn)), 4), "false_negative_rate": round(float(fn / (fn + tp)), 4),
    }


def export(vec: TfidfVectorizer, clf: LogisticRegression, kind: str, extra: dict) -> dict:
    vocab = vec.vocabulary_
    coef = clf.coef_[0]
    idf = vec.idf_
    features = {term: [round(float(idf[i]), 5), round(float(coef[i]), 5)] for term, i in vocab.items()}
    return {"kind": kind, "intercept": float(clf.intercept_[0]), "features": features, **extra}


def train_text() -> dict:
    data = json.loads((RAW / "texts.json").read_text())
    texts = [d["text"] for d in data]
    labels = np.array([int(d["label"]) for d in data])
    x_tr, x_te, y_tr, y_te = train_test_split(texts, labels, test_size=0.2, random_state=SEED, stratify=labels)
    vec = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), min_df=3, max_df=0.9, max_features=40000,
                          sublinear_tf=True, token_pattern=r"(?u)\b\w\w+\b")
    xtr = vec.fit_transform(x_tr)
    clf = LogisticRegression(C=4.0, max_iter=2000, class_weight="balanced")
    clf.fit(xtr, y_tr)
    prob = clf.predict_proba(vec.transform(x_te))[:, 1]
    m = metrics(y_te, prob)
    m["dataset"] = "ealvaradob/phishing-dataset texts.json (emails + SMS), 80/20 stratified split, seed 42"
    model = export(vec, clf, "text", {"ngram_range": [1, 2]})
    return model, m


def train_url(sample: int = 300000) -> dict:
    data = json.loads((RAW / "urls.json").read_text())
    random.Random(SEED).shuffle(data)
    data = data[:sample]
    urls = [url_for_model(d["text"]) for d in data]
    labels = np.array([int(d["label"]) for d in data])
    x_tr, x_te, y_tr, y_te = train_test_split(urls, labels, test_size=0.2, random_state=SEED, stratify=labels)
    vec = TfidfVectorizer(lowercase=True, analyzer="char", ngram_range=(3, 5), min_df=5, max_features=60000, sublinear_tf=True)
    xtr = vec.fit_transform(x_tr)
    clf = LogisticRegression(C=2.0, max_iter=2000, class_weight="balanced")
    clf.fit(xtr, y_tr)
    prob = clf.predict_proba(vec.transform(x_te))[:, 1]
    m = metrics(y_te, prob)
    m["dataset"] = f"ealvaradob/phishing-dataset urls.json, random {sample} URLs, 80/20 stratified split, seed 42; scheme and www. stripped"
    model = export(vec, clf, "url", {"ngram_range": [3, 5]})
    return model, m


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, fn in (("text", train_text), ("url", train_url)):
        t = time.time()
        model, m = fn()
        m["train_seconds"] = round(time.time() - t, 1)
        (MODEL_DIR / f"{name}_model.json").write_text(json.dumps(model, separators=(",", ":")))
        report[name] = m
        print(name, json.dumps(m, indent=1))
    (EVAL_DIR / "ml_metrics.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
