# FraudLens — explainable phishing & digital-fraud detection

Paste an SMS, a WhatsApp message, a raw email (headers included) or a link. FraudLens returns a
**risk score (0–100) and level (low / medium / high)**, the **scam type** (fake KYC, digital arrest,
fake job, investment, prize, delivery, government impersonation, …), **every indicator with the
exact evidence and a plain-language explanation**, a per-link breakdown, and **what to do next**
(including India's 1930 helpline and cybercrime.gov.in).

Built for the CC6-AI05 brief "Intelligent Phishing and Digital Fraud Detection".

- `/` — analyser UI with 8 ready-made samples and a local-only history
- `/report` — evaluation dashboard (precision, recall, false positives/negatives, limitations)
- `POST /api/analyze` `{"content": "...", "live": false}` — JSON API (`/docs` for the schema)

## How it works

```
input ─► normalise (NFKC, zero-width strip, refang hxxp/[.] , undo "K.Y.C"/"bl0cked")
      ├─► raw email? ─► header checks: display-name brand vs sender domain, free-mail "official",
      │                 Reply-To / Return-Path mismatch, SPF / DKIM / DMARC failures
      ├─► text rules  ─► 20 weighted Indian-context fraud patterns + 2 "genuine message" patterns
      ├─► text ML     ─► TF-IDF (1–2 grams) + logistic regression, top contributing words shown
      └─► each URL    ─► threat intel (OpenPhish, URLhaus), Tranco top-100k reputation,
                         brand-on-wrong-domain, typosquat (edit distance + homoglyph skeleton),
                         punycode/IDN, IP host, "@" trick, shorteners, free hosting, risky TLDs,
                         redirect parameters, char-n-gram URL ML model,
                         optional live check (redirect chain, TLS, RDAP domain age)
score = text rules (cap 70) + email + ML + combination bonuses + riskiest URL; intel hit ⇒ ≥ 90
low < 30 ≤ medium < 60 ≤ high
```

The ML models are trained with scikit-learn and exported to plain JSON; inference is pure Python,
so the deployed app needs only FastAPI, Uvicorn and tldextract (~4 MB of model + intel data).

## Results (from `REPORT.md`, flagged = medium or high)

| Test | Precision | Recall | Notes |
|---|---|---|---|
| Held-out hand-written set (45 Indian-context items) | 87.0% | 90.9% | 3 of 23 false alarms, 2 of 22 missed |
| Development set (110 items, used for tuning) | 90.9% | 100% | optimistic — regression test only |
| 2,000 public URLs never used in training, intel off | 97.8% | 71.0% | 16 of 1,000 legitimate URLs flagged |
| 1,000 held-out public emails/SMS | 92.2% | 81.9% | 26 of 624 legitimate flagged |
| 300 live OpenPhish URLs, feed lookup disabled | — | 76.0% | measures *new* attacks |
| Text model alone (4,028 test items) | 96.0% | 97.3% | ROC AUC 0.997 |
| URL model alone (60,000 test items) | 92.9% | 94.1% | ROC AUC 0.987 |

Mean analysis time ≈ 12 ms per item (p95 ≈ 16 ms) without the live check. Every miss and false
alarm, and the limitations, are listed in `REPORT.md` and on `/report`.

## Privacy

Content is analysed in memory and never stored or logged (logs record only type, level, score and
time). History stays in the browser's localStorage and can be switched off or cleared. The live link
check is opt-in because it contacts the link's server; it refuses private/internal addresses.
Responses are `Cache-Control: no-store`, with a strict Content-Security-Policy.

## Run locally

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload          # http://127.0.0.1:8000
.venv/bin/python -m pytest -q                    # unit + API tests
.venv/bin/python scripts/smoke_test.py           # end-to-end HTTP checks
```

Docker: `docker build -t fraudlens . && docker run -p 8000:8000 fraudlens`

## Retrain, refresh intel, re-evaluate

Raw data (not committed, ~160 MB) goes in `data/raw/`: `texts.json` and `urls.json` from the
Hugging Face dataset `ealvaradob/phishing-dataset` (Apache-2.0) and the Tranco list `top-1m.csv`.

```bash
.venv/bin/python scripts/train.py        # writes app/model/{text,url}_model.json
.venv/bin/python scripts/fetch_intel.py  # refresh OpenPhish / URLhaus / Tranco snapshot
.venv/bin/python scripts/evaluate.py     # writes REPORT.md and app/model/eval_report.json
```

Intel is a snapshot taken at build time; refresh and redeploy regularly (daily is reasonable).

## Deploy

- **Vercel:** `npx vercel deploy --prod` from this folder (entrypoint `app/main.py` is auto-detected;
  `.vercelignore` keeps raw data out of the bundle).
- **Any container host (Render, Railway, Fly, Cloud Run):** use the `Dockerfile`; it honours `$PORT`.

The rate limit (30 analyses/minute per IP) is in memory, so on multi-instance hosts it applies per
instance.

## Limitations (short version)

The hand-written test sets are small (wide confidence intervals); the public training text is mostly
English email, so Indian SMS coverage relies on the rules; genuine bank alerts can score medium;
phishing on big shared platforms gets less help from reputation; only text is analysed (no images,
QR codes, attachments or calls). Full list in `REPORT.md`.
