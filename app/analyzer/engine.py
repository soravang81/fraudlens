"""Combine rules, URL analysis, email headers, ML and threat intel into one explained verdict."""
import re
import time

from . import guidance, live_check, ml
from .email_rules import analyze_email, looks_like_raw_email
from .normalize import deobfuscate, extract_emails, extract_phones, extract_urls, normalize_text, refang
from .text_rules import Hit, run_text_rules
from .url_rules import analyze_url, parse

MAX_CHARS = 20000
MAX_URLS = 10
# Indicators that ask the reader to do something. A message with none of these and no link
# (e.g. a debit alert or statement notice) has no way to take money or credentials by itself.
ACTION_IDS = {
    "credential_request", "payment_request", "kyc", "link_cta", "remote_access", "unusual_payment", "prize", "job",
    "investment", "threat", "contact_switch", "family_impersonation", "delivery", "loan", "secrecy",
}
LEVELS = ((60, "high"), (30, "medium"), (0, "low"))


def _level(score: int) -> str:
    return next(name for cut, name in LEVELS if score >= cut)


def _ml_text_points(prob: float) -> int:
    # A confident model (p >= ~0.81) can reach the medium threshold on its own.
    if prob >= 0.5:
        return round((prob - 0.5) * 96)
    if prob < 0.3:
        return -round((0.3 - prob) * 20)
    return 0


def _ml_url_points(prob: float) -> int:
    return round((prob - 0.5) * 80) if prob >= 0.5 else -round((0.5 - prob) * 10)


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
    ids = {h.id for h in text_hits}
    if not is_url_only and not urls and not (ids & ACTION_IDS) and not email_summary:
        text_hits.append(Hit("no_action", "No link and no request for action", -10,
                             "The message only informs you; it doesn't ask you to click, call, pay or share anything.", [], "reassurance"))
    if re.search(r"\bdigital arrest\b", clean, re.I):
        ids.add("digital_arrest")

    url_reports, best_url_points, intel_types = [], 0, set()
    for u in urls:
        parsed, hits, intel_hit = analyze_url(u)
        ml_url = ml.predict_url(u) if use_ml else None
        pts = sum(h.weight for h in hits)
        if ml_url:
            ml_pts = _ml_url_points(ml_url["probability"])
            if any(h.id == "reputation" for h in hits) and ml_pts > 0:
                ml_pts //= 3
            pts += ml_pts
        live_info = None
        if live and parsed is not None and not parsed.is_ip:
            live_info = _live(u, parsed, hits)
            pts = sum(h.weight for h in hits) + (ml_pts if ml_url else 0)
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

    ml_text = ml.predict_text(clean) if (use_ml and not is_url_only and len(clean.split()) >= 3) else None
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
    raw = lang_points + email_points + ml_points + combo + (best_url_points if urls else 0)
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
            "explanation": "A model trained on ~16,000 labelled phishing and legitimate messages. Words that pushed the score up: "
                           + (", ".join(f"'{t}'" for t in ml_text["top_terms"][:5]) or "none") + ".",
            "evidence": [],
        })

    return {
        "score": score,
        "level": level,
        "scenarios": [{"id": s, "name": guidance.SCENARIOS[s][0]} for s in scenarios],
        "summary": _summary(level, scenarios, indicators, url_reports),
        "indicators": indicators,
        "urls": url_reports,
        "email": email_summary,
        "extracted": {"urls": urls, "emails": extract_emails(clean)[:10], "phones": extract_phones(clean)[:10]},
        "advice": guidance.advice(level, scenarios),
        "ml": {"text": ml_text},
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
        "input_type": "email" if email_summary else ("url" if is_url_only else "message"),
    }


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
