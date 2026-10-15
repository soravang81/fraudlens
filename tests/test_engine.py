import pytest

from app.analyzer import live_check
from app.analyzer.engine import analyze
from app.analyzer.normalize import deobfuscate, extract_urls, redact
from app.analyzer.url_rules import analyze_url


def ids(result):
    out = {i["id"] for i in result["indicators"]}
    for u in result["urls"]:
        out |= {i["id"] for i in u["indicators"]}
    return out


@pytest.mark.parametrize("text,scenario", [
    ("Dear Customer, your SBI account will be blocked today. Update KYC at http://sbi-kyc-update.xyz/login", "bank_kyc"),
    ("You are under digital arrest. This is CBI. Do not tell anyone. Transfer Rs 50000 to verify.", "digital_arrest"),
    ("Part time job! Earn Rs 3000 per day by liking YouTube videos. Pay registration fee Rs 499.", "job"),
    ("Congratulations! You have won Rs 25,00,000 in KBC lucky draw. Pay processing fee Rs 5000 to claim your prize.", "prize"),
    ("Guaranteed returns of 5% daily. Double your money in our VIP trading group.", "investment"),
])
def test_scams_are_high_risk_with_named_scenario(text, scenario):
    r = analyze(text)
    assert r["level"] == "high"
    assert scenario in {s["id"] for s in r["scenarios"]}
    assert r["advice"]


@pytest.mark.parametrize("text", [
    "482910 is your OTP for login to HDFC Bank NetBanking. Do not share this OTP with anyone.",
    "Hi! Are we still meeting at the cafe at 6 today?",
    "https://www.amazon.in/gp/your-account/order-history",
    "Delhivery: shipment out for delivery today. Share OTP 4821 with the delivery agent only at the time of delivery.",
])
def test_legitimate_messages_are_low_risk(text):
    assert analyze(text)["level"] == "low"


def test_every_indicator_is_explained():
    r = analyze("URGENT: your Paytm KYC expired, account will be blocked. Click here: http://paytm-kyc.top")
    for ind in r["indicators"] + [i for u in r["urls"] for i in u["indicators"]]:
        assert ind["label"] and ind["explanation"]


def test_lookalike_and_homoglyph_domains():
    assert {"lookalike"} <= ids(analyze("http://paypa1-secure.com/signin"))
    assert "punycode" in ids(analyze("https://xn--hdfcbnk-0ya.com/login"))
    assert "brand_mismatch" in ids(analyze("https://secure.icicibank.com.verify-acct.xyz/login"))


def test_at_symbol_url_is_not_treated_as_email():
    assert extract_urls("go to http://www.google.com@phishing-site.ru/login") == ["http://www.google.com@phishing-site.ru/login"]
    assert "at_symbol" in ids(analyze("http://www.google.com@phishing-site.ru/login"))


def test_official_domain_gets_reputation_credit():
    _, hits, _ = analyze_url("https://netbanking.hdfcbank.com/netbanking/")
    names = {h.id for h in hits}
    assert "brand_mismatch" not in names and "lookalike" not in names


def test_raw_email_headers_are_checked():
    raw = ("From: \"HDFC Bank\" <alerts@hdfc-secure.top>\nReply-To: help@gmail.com\nSubject: Account locked\n"
           "Authentication-Results: mx; spf=fail; dkim=none; dmarc=fail\n\nDear customer, verify now: http://hdfc-secure.top/x")
    r = analyze(raw)
    assert r["input_type"] == "email"
    assert {"sender_brand_mismatch", "reply_to_mismatch", "spf_fail"} <= ids(r)
    assert r["level"] == "high"


def test_obfuscation_is_undone_for_wording_but_not_links():
    assert "KYC" in deobfuscate("update your K.Y.C now")
    assert "blocked" in deobfuscate("bl0cked")
    assert extract_urls("visit paypa1-login.com") == ["paypa1-login.com"]


def test_word_like_country_endings_in_sentences_are_not_links():
    assert extract_urls("Just now saw your message.it k da") == []
    assert extract_urls("pay at paypal.me/fixer now") == ["paypal.me/fixer"]
    assert extract_urls("message.it") == ["message.it"]


def test_link_model_alone_does_not_flag_a_harmless_message():
    r = analyze("Hi team, the meeting notes are on http://www.newsisfree.com/click/-1,8622124,215/ see you at 5")
    assert r["breakdown"]["benign_context"] is True
    assert r["level"] == "low"


@pytest.mark.parametrize("text", [
    "arnazon",
    "Arnazon prime renewal failed, update card",
    "PayPa1: payment declined. Verify your billing now",
    "G00gle security alert: unusual sign-in",
])
def test_disguised_brand_names_in_text_are_flagged(text):
    r = analyze(text)
    assert "lookalike_brand" in ids(r)
    assert r["level"] in ("medium", "high")


@pytest.mark.parametrize("text", [
    "I bought this on amazon yesterday, amazing deal",
    "Your Swiggy order is out for delivery",
    "Let us meet for the finance review in the cloud office",
    "Amazon: your order has shipped",
])
def test_real_brand_names_and_ordinary_words_are_not_lookalikes(text):
    assert "lookalike_brand" not in ids(analyze(text))


def test_plain_typo_counts_less_than_a_disguise():
    typo = next(i for i in analyze("microsft teams meeting")["indicators"] if i["id"] == "lookalike_brand")
    disguise = next(i for i in analyze("rnicrosoft teams meeting")["indicators"] if i["id"] == "lookalike_brand")
    assert typo["weight"] < disguise["weight"]


def test_highlights_mark_the_words_that_triggered_warnings():
    text = "Arnazon prime renewal failed, update card at http://arnazon-pay.top"
    h = analyze(text)["highlights"]
    marked = {(text[s["start"]:s["end"]], s["kind"]) for s in h["spans"]}
    assert ("Arnazon", "warn") in marked and ("http://arnazon-pay.top", "link") in marked


def test_redact_masks_personal_data():
    out = redact("mail me at a.b@example.com or call 9876543210")
    assert "example.com" not in out and "9876543210" not in out


def test_live_check_refuses_private_addresses():
    result = live_check.follow_redirects("http://127.0.0.1:8000/admin")
    assert result["chain"] == [] and "non-public" in result["error"]


def test_score_is_bounded_and_fast():
    r = analyze("x " * 5000)
    assert 0 <= r["score"] <= 100
    assert r["elapsed_ms"] < 1000
