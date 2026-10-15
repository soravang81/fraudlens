"""Look-alike detection shared by URL and message checks: 'arnazon', 'paypa1', 'g00gle', 'netfIix'."""
import re

HOMOGLYPHS = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "l"})

# Brand words people type in messages (lower case, no spaces) -> official site shown in explanations.
BRAND_WORDS: dict[str, str] = {
    "amazon": "amazon.in", "flipkart": "flipkart.com", "paypal": "paypal.com", "paytm": "paytm.com", "phonepe": "phonepe.com",
    "google": "google.com", "gmail": "gmail.com", "youtube": "youtube.com", "microsoft": "microsoft.com", "outlook": "outlook.com",
    "office365": "office.com", "netflix": "netflix.com", "apple": "apple.com", "icloud": "icloud.com", "facebook": "facebook.com",
    "instagram": "instagram.com", "whatsapp": "whatsapp.com", "telegram": "telegram.org", "linkedin": "linkedin.com",
    "myntra": "myntra.com", "meesho": "meesho.com", "swiggy": "swiggy.com", "zomato": "zomato.com", "hotstar": "hotstar.com",
    "spotify": "spotify.com", "airtel": "airtel.in", "vodafone": "myvi.in", "irctc": "irctc.co.in", "delhivery": "delhivery.com",
    "bluedart": "bluedart.com", "fedex": "fedex.com", "indiapost": "indiapost.gov.in", "hdfc": "hdfcbank.com", "icici": "icicibank.com",
    "kotak": "kotak.com", "axisbank": "axisbank.com", "canarabank": "canarabank.com", "bankofbaroda": "bankofbaroda.in",
    "incometax": "incometax.gov.in", "aadhaar": "uidai.gov.in", "uidai": "uidai.gov.in", "epfo": "epfindia.gov.in",
    "parivahan": "parivahan.gov.in", "naukri": "naukri.com", "coinbase": "coinbase.com", "binance": "binance.com",
    "dropbox": "dropbox.com", "docusign": "docusign.com", "adobe": "adobe.com", "steam": "steampowered.com", "uber": "uber.com",
}
# Real words one edit away from a brand; never treat these as look-alikes.
_REAL_WORDS = {"finance", "goggle", "goggles", "cloud", "aircel", "amazing", "amazed", "phones", "phoned", "gmal", "updates",
               "steal", "steak", "stems", "steamy", "adore", "abode", "tuber", "super", "kotaks", "airtels", "delivery",
               "phoneme", "tomato", "potato", "naukar", "binary"}
_BY_LEN: dict[int, list[str]] = {}
for _b in BRAND_WORDS:
    _BY_LEN.setdefault(len(_b), []).append(_b)


def skeleton(word: str) -> str:
    """Collapse characters that look alike so 'arnazon' -> 'amazon' and 'paypa1' -> 'paypal'."""
    if re.search(r"[a-z]", word):
        word = word.replace("I", "l")
    s = word.lower().translate(HOMOGLYPHS)
    return s.replace("rn", "m").replace("vv", "w").replace("cl", "d").replace("-", "").replace("_", "")


def levenshtein(a: str, b: str) -> int:
    if abs(len(a) - len(b)) > 2:
        return 3
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def imitated_brand(token: str) -> tuple[str, str] | None:
    """(brand, 'disguised' | 'misspelled') for a word imitating a brand, or None if real or unrelated.
    'disguised' = look-alike characters swapped in (rn->m, 1->l, 0->o); 'misspelled' = one letter off."""
    low = token.lower()
    if len(low) < 4 or low in BRAND_WORDS or low in _REAL_WORDS:
        return None
    skel = skeleton(token)
    if skel != low and skel in BRAND_WORDS:
        return skel, "disguised"
    if not low.isalpha() or len(low) < 6:
        return None
    for n in (len(low) - 1, len(low), len(low) + 1):
        for brand in _BY_LEN.get(n, ()):
            if len(brand) >= 6 and brand[0] == low[0] and not low.startswith(brand) and not brand.startswith(low) \
                    and levenshtein(low, brand) == 1:
                return brand, "misspelled"
    return None


_WORD = re.compile(r"[A-Za-z0-9@$!|]+(?:[-_][A-Za-z0-9@$!|]+)*")


def find_in_text(text: str) -> list[tuple[str, tuple[str, str], int, int]]:
    """(word, (brand, kind), start, end) for each brand look-alike written in a message, skipping links and emails."""
    out, seen = [], set()
    for m in _WORD.finditer(text):
        word = m.group(0)
        before = text[max(0, m.start() - 1):m.start()]
        after = text[m.end():m.end() + 1]
        if before in (".", "/", "@") or after in (".", "/", "@") and m.end() + 1 < len(text) and text[m.end() + 1].isalnum():
            continue
        if word.isdigit() or not re.search(r"[A-Za-z]", word):
            continue
        brand = imitated_brand(word.strip("@$!|"))
        if brand and word.lower() not in seen:
            seen.add(word.lower())
            out.append((word, brand, m.start(), m.end()))
    return out
