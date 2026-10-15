"""Combine rules, URL analysis, email headers, ML and threat intel into one explained verdict."""
import re
import time

from . import guidance, live_check, ml
from .email_rules import analyze_email, looks_like_raw_email
from .normalize import deobfuscate, extract_emails, extract_phones, extract_urls, normalize_text, refang
from .text_rules import Hit, highlight_spans, lookalike_hit, run_text_rules
from .url_rules import analyze_url, parse

MAX_CHARS = 20000
MAX_URLS = 10
# Indicators that ask the reader to do something. A message with none of these and no link
# (e.g. a debit alert or statement notice) has no way to take money or credentials by itself.
ACTION_IDS = {
    "credential_request", "payment_request", "kyc", "link_cta", "remote_access", "unusual_payment", "prize", "job",
    "investment", "threat", "contact_switch", "family_impersonation", "delivery", "loan", "secrecy",
    "account_problem", "lookalike_brand",
}
HIGHLIGHT_LIMIT = 5000
LEVELS = ((60, "high"), (30, "medium"), (0, "low"))


def _level(score: int) -> str:
    return next(name for cut, name in LEVELS if score >= cut)


# ML probability -> points: slope * (p - pivot) above the pivot, a small deduction below `low`.
# Tuned by scripts/tune.py on validation data only (never on the test sets).
TEXT_ML = {"pivot": 0.4, "slope": 80, "low": 0.3, "low_slope": 20}
URL_ML = {"pivot": 0.6, "slope": 130, "low": 0.5, "low_slope": 10, "benign_context_factor": 0.0}


def _ml_points(prob: float, cfg: dict) -> int:
    if prob >= cfg["pivot"]:
        return round((prob - cfg["pivot"]) * cfg["slope"])
    if prob < cfg["low"]:
        return -round((cfg["low"] - prob) * cfg["low_slope"])
    return 0


def _ml_text_points(prob: float) -> int:
    return _ml_points(prob, TEXT_ML)


def _ml_url_points(prob: float) -> int:
    return _ml_points(prob, URL_ML)


def analyze(content: str, *, live: bool = False, use_ml: bool = True) -> dict:
    started = time.perf_counter()
    text = normalize_text(content)[:MAX_CHARS]
    email_summary, email_hits = None, []
    body = text
    if looks_like_raw_email(text):
        email_summary, email_hits, body = analyze_email(text)
    link_text = refang(body)
    clean = deobfuscate(body)
    urls = extract_urls(link_text)[:MAX_URLS]
    is_url_only = len(urls) == 1 and link_text.strip().rstrip("/") in (urls[0].rstrip("/"), "http://" + urls[0].rstrip("/"), "https://" + urls[0].rstrip("/"))

    text_hits = [] if is_url_only else run_text_rules(clean)
    disguised = None if is_url_only else lookalike_hit(body)
    if disguised:
        text_hits.append(disguised)
    ids = {h.id for h in text_hits}
    if not is_url_only and not urls and not (ids & ACTION_IDS) and not email_summary:
        text_hits.append(Hit("no_action", "No link and no request for action", -10,
                             "The message only informs you; it doesn't ask you to click, call, pay or share anything.", [], "reassurance"))
    if re.search(r"\bdigital arrest\b", clean, re.I):
        ids.add("digital_arrest")

    ml_text = ml.predict_text(clean) if (use_ml and not is_url_only and len(clean.split()) >= 3) else None
    # A link inside a message that reads as harmless and asks for nothing gets less weight from the URL model.
    benign_context = (ml_text is not None and ml_text["probability"] < 0.5 and not (ids & ACTION_IDS)
                      and sum(h.weight for h in email_hits) <= 0)

    url_reports, best_url_points, intel_types = [], 0, set()
    for u in urls:
        parsed, hits, intel_hit = analyze_url(u)
        ml_url = ml.predict_url(u) if use_ml else None
        pts = sum(h.weight for h in hits)
        ml_pts = 0
        if ml_url:
            ml_pts = _ml_url_points(ml_url["probability"])
            if any(h.id == "reputation" for h in hits) and ml_pts > 0:
                ml_pts //= 3
            if benign_context and ml_pts > 0:
                ml_pts = round(ml_pts * URL_ML["benign_context_factor"])
            ml_url["points"] = ml_pts
            pts += ml_pts
        live_info = None
        if live and parsed is not None and not parsed.is_ip:
            live_info = _live(u, parsed, hits)
            pts = sum(h.weight for h in hits) + ml_pts
        if intel_hit:
            intel_types.add(intel_hit["type"])
        ids |= {h.id for h in hits}
        url_score = max(0, min(100, pts))
        best_url_points = max(best_url_points, pts)
        url_reports.append({
            "url": u,
            "host": parsed.host if parsed else None,
            "registered_domain": parsed.registered_domain if parsed else None,
            "display_host": parsed.unicode_host if parsed else None,
            "score": url_score,
            "level": _level(url_score) if not intel_hit else "high",
            "indicators": [h.as_dict() for h in sorted(hits, key=lambda h: -h.weight)],
            "ml": ml_url,
            "intel": intel_hit,
            "live": live_info,
        })
    ids |= {h.id for h in email_hits}

    lang_points = min(70, sum(h.weight for h in text_hits))
    email_points = sum(h.weight for h in email_hits)
    ml_points = _ml_text_points(ml_text["probability"]) if ml_text else 0
    combo = 0
    if "credential_request" in ids and urls:
        combo += 10
    if ids & {"threat", "urgency"} and ids & {"payment_request", "credential_request", "kyc"}:
        combo += 5
    if "threat" in ids and "contact_switch" in ids:
        combo += 10
    if "payment_request" in ids and ids & {"job", "prize", "loan", "investment"}:
        combo += 10
    if "lookalike_brand" in ids and (urls or ids & {"account_problem", "credential_request", "payment_request", "threat"}):
        combo += 10
    link_points = best_url_points if urls else 0
    raw = lang_points + email_points + ml_points + combo + link_points
    score = max(0, min(100, raw))
    if intel_types:
        score = max(score, 90)
    level = _level(score)

    scenarios = guidance.detect_scenarios(ids, intel_types) if level != "low" else []
    reasons = sorted(text_hits + email_hits, key=lambda h: -h.weight)
    indicators = [h.as_dict() for h in reasons]
    if ml_text:
        indicators.append({
            "id": "ml_text", "label": f"Machine-learning model: {round(ml_text['probability'] * 100)}% phishing-like language",
            "weight": ml_points, "category": "ml",
            "explanation": "A model trained on ~14,500 labelled phishing and legitimate messages. Words that pushed the score up: "
                           + (", ".join(f"'{t}'" for t in ml_text["top_terms"][:5]) or "none") + ".",
            "evidence": [],
        })

    return {
        "score": score,
        "level": level,
        "scenarios": [{"id": s, "name": guidance.SCENARIOS[s][0]} for s in scenarios],
        "summary": _summary(level, scenarios, indicators, url_reports),
        "breakdown": {"wording": lang_points, "email_headers": email_points, "language_model": ml_points,
                      "combinations": combo, "links": link_points, "threat_intel": bool(intel_types),
                      "benign_context": benign_context},
        "signals": [name for name, pts in (("wording", lang_points), ("language model", ml_points), ("links", link_points),
                                             ("email headers", email_points)) if pts > 0] + (["threat intelligence"] if intel_types else []),
        "highlights": _highlights(body, text_hits, urls),
        "indicators": indicators,
        "urls": url_reports,
        "email": email_summary,
        "extracted": {"urls": urls, "emails": extract_emails(clean)[:10], "phones": extract_phones(clean)[:10]},
        "advice": guidance.advice(level, scenarios),
        "ml": {"text": ml_text},
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
        "input_type": "email" if email_summary else ("url" if is_url_only else "message"),
    }


def _highlights(body: str, hits: list[Hit], urls: list[str]) -> dict:
    """The message as typed, with the parts that triggered warnings marked (first 5,000 characters)."""
    text = body[:HIGHLIGHT_LIMIT]
    kinds = {h.id: ("safe" if h.weight < 0 else "warn") for h in hits}
    spans = [(s, e, rid) for s, e, rid in highlight_spans(text, {i for i in kinds if i != "lookalike_brand"})]
    for h in hits:
        if h.id == "lookalike_brand":
            spans += [(s, e, h.id) for s, e in h.spans]
    for u in urls:
        i = text.find(u)
        if i >= 0:
            spans.append((i, i + len(u), "link"))
    spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
    merged, end = [], -1
    for s, e, rid in spans:
        if s >= end and e <= len(text):
            merged.append({"start": s, "end": e, "id": rid, "kind": "link" if rid == "link" else kinds.get(rid, "warn")})
            end = e
    return {"text": text, "spans": merged, "truncated": len(body) > HIGHLIGHT_LIMIT}


def _live(url: str, parsed, hits: list[Hit]) -> dict:
    info = live_check.follow_redirects(url)
    age = live_check.domain_age_days(parsed.registered_domain)
    info["domain_age_days"] = age
    final = info.get("final_url")
    if final:
        fp = parse(final)
        if fp and fp.registered_domain != parsed.registered_domain:
            hits.append(Hit("redirects_elsewhere", "Redirects to a different domain", 12,
                            f"The link redirects to {fp.registered_domain}, so the address shown isn't where you end up.", [final[:100]], "url"))
    if info.get("https_ok") is False:
        hits.append(Hit("bad_certificate", "HTTPS certificate problem", 15,
                        "The site's security certificate is invalid; your browser would show a warning.", [info.get("error") or ""], "url"))
    if age is not None and age < 30:
        hits.append(Hit("new_domain", f"Domain registered {age} days ago", 25,
                        "Scam sites are usually brand new; most are taken down within weeks.", [parsed.registered_domain], "url"))
    elif age is not None and age > 365 * 3:
        hits.append(Hit("old_domain", f"Domain is {age // 365} years old", -5,
                        "Long-established domains are less likely to be throwaway scam sites.", [parsed.registered_domain], "url"))
    return info


def _summary(level: str, scenarios: list[str], indicators: list[dict], urls: list[dict]) -> str:
    if level == "low":
        return "No strong signs of phishing or fraud were found."
    kind = guidance.SCENARIOS[scenarios[0]][0] if scenarios else "Suspicious content"
    top = [i["label"].lower() for i in indicators if i["weight"] > 0][:2]
    top += [i["label"].lower() for u in urls for i in u["indicators"] if i["weight"] > 0][:2]
    reasons = "; ".join(dict.fromkeys(top))
    prefix = "Likely" if level == "high" else "Possible"
    return f"{prefix} {kind.lower()}" + (f": {reasons}." if reasons else ".")
