"use strict";

const SAMPLES = [
  { label: "Bank KYC SMS", text: "Dear Customer, your SBI YONO account will be blocked today. Please update your PAN/KYC immediately: http://sbi-yono-kyc.xyz/update" },
  { label: "Digital arrest", text: "This is Inspector Sharma from Mumbai Cyber Crime. A parcel with drugs was booked on your Aadhaar. You are under digital arrest. Do not tell your family. Transfer Rs 95,000 for verification or an arrest warrant will be issued." },
  { label: "Fake job", text: "Part time job! Earn Rs 3000 per day from home by liking YouTube videos. No experience required. Pay registration fee Rs 499. WhatsApp 9876543210" },
  { label: "UPI refund", text: "Your electricity refund of Rs 2,450 is approved. Enter your UPI PIN to receive the amount in the collect request sent to you." },
  { label: "Look-alike link", text: "https://paypa1-secure-login.com/signin?account=verify" },
  { label: "Phishing email", text: "From: \"HDFC Bank Security\" <alerts@hdfc-secure-mail.top>\nReply-To: support.hdfcbank@gmail.com\nSubject: Urgent: Unusual login detected\nAuthentication-Results: mx.example.com; spf=fail; dkim=none; dmarc=fail\n\nDear Customer,\nWe detected an unusual login on your NetBanking account. Your account will be suspended within 24 hours. Click here to verify your identity and confirm your debit card details: http://hdfcbank.com.verify-login.top/secure" },
  { label: "Real OTP (safe)", text: "482910 is your OTP for login to HDFC Bank NetBanking. Valid for 5 mins. Do not share this OTP with anyone. If not initiated by you, call 1800-202-6161." },
  { label: "Normal chat (safe)", text: "Hi! Are we still meeting at the cafe at 6 today? I'll bring the documents for the flat." },
];
const LEVEL_TEXT = { low: "Low risk", medium: "Medium risk — be careful", high: "High risk — likely scam" };
const HISTORY_KEY = "fraudlens.history.v1";
const PREF_KEY = "fraudlens.keepHistory";

const $ = (id) => document.getElementById(id);
const el = (tag, opts = {}, children = []) => {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.appendChild(c);
  return node;
};

function show(state) {
  $("empty-state").hidden = state !== "empty";
  $("loading").hidden = state !== "loading";
  $("result").hidden = state !== "result";
}

function renderSamples() {
  const box = $("samples");
  for (const s of SAMPLES) {
    const b = el("button", { className: "chip", text: s.label, attrs: { type: "button" } });
    b.addEventListener("click", () => {
      $("content").value = s.text;
      updateCount();
      $("content").focus();
    });
    box.appendChild(b);
  }
}

function updateCount() {
  $("char-count").textContent = `${$("content").value.length.toLocaleString()} / 20,000`;
}

function indicatorItem(ind) {
  let cls = "indicator";
  if (ind.category === "ml") cls += " ml";
  else if (ind.weight < 0) cls += " safe";
  else if (ind.weight >= 20) cls += " strong";
  const pts = ind.weight > 0 ? `+${ind.weight}` : `${ind.weight}`;
  const li = el("li", { className: cls }, [
    el("div", { className: "indicator-head" }, [el("span", { text: ind.label }), el("span", { className: "points", text: `${pts} pts` })]),
    el("p", { text: ind.explanation }),
  ]);
  for (const ev of ind.evidence || []) if (ev) li.appendChild(el("code", { className: "evidence", text: ev }));
  return li;
}

function renderResult(r) {
  const v = $("verdict");
  v.className = `verdict ${r.level}`;
  $("verdict-level").textContent = LEVEL_TEXT[r.level];
  $("verdict-summary").textContent = r.summary;
  $("score-value").textContent = r.score;
  const fill = $("meter-fill");
  fill.className = `meter-fill ${r.level}`;
  fill.style.width = `${Math.max(3, r.score)}%`;

  const chips = $("scenario-chips");
  chips.replaceChildren(...r.scenarios.map((s) => el("span", { className: "chip tag", text: s.name })));

  $("advice").replaceChildren(...r.advice.map((a) => el("li", { text: a })));

  const inds = [...r.indicators];
  const list = $("indicators");
  if (!inds.length && !r.urls.some((u) => u.indicators.length)) {
    list.replaceChildren(el("li", { className: "muted", text: "No warning indicators matched." }));
  } else {
    list.replaceChildren(...inds.map(indicatorItem));
  }

  const emailBlock = $("email-block");
  emailBlock.hidden = !r.email;
  if (r.email) {
    const dl = $("email-meta");
    dl.replaceChildren();
    for (const [k, label] of [["from", "From"], ["reply_to", "Reply-To"], ["subject", "Subject"], ["from_domain", "Sender domain"]]) {
      if (r.email[k]) { dl.appendChild(el("dt", { text: label })); dl.appendChild(el("dd", { text: r.email[k] })); }
    }
  }

  const urlBlock = $("url-block");
  urlBlock.hidden = !r.urls.length;
  $("urls").replaceChildren(...r.urls.map((u) => {
    const card = el("div", { className: "url-card" }, [
      el("div", { className: "url-head" }, [
        el("span", { className: "url-text", text: u.url }),
        el("span", { className: `badge ${u.level}`, text: `${u.level.toUpperCase()} · ${u.score}` }),
      ]),
    ]);
    const facts = [];
    if (u.registered_domain) facts.push(`Real domain: ${u.registered_domain}`);
    if (u.display_host && u.display_host !== u.host) facts.push(`Displays as: ${u.display_host}`);
    if (u.ml) facts.push(`URL model: ${Math.round(u.ml.probability * 100)}% phishing-like`);
    if (u.live) {
      if (u.live.final_url && u.live.final_url !== u.url) facts.push(`Lands on: ${u.live.final_url}`);
      if (u.live.domain_age_days != null) facts.push(`Domain age: ${u.live.domain_age_days} days`);
      if (u.live.error) facts.push(`Live check: ${u.live.error}`);
    }
    if (facts.length) card.appendChild(el("p", { className: "small muted", text: facts.join(" · ") }));
    const ul = el("ul", { className: "indicators" }, u.indicators.map(indicatorItem));
    card.appendChild(ul);
    return card;
  }));

  $("timing").textContent = `Analysed as ${r.input_type} in ${r.elapsed_ms} ms.`;
  show("result");
}

async function onSubmit(e) {
  e.preventDefault();
  const content = $("content").value;
  const err = $("form-error");
  err.hidden = true;
  if (!content.trim()) {
    err.textContent = "Paste a message, email or link first.";
    err.hidden = false;
    $("content").focus();
    return;
  }
  const btn = $("submit-btn");
  btn.disabled = true;
  btn.textContent = "Analysing…";
  show("loading");
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, live: $("live").checked }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The analysis failed. Please try again.");
    renderResult(data);
    saveHistory(content, data);
  } catch (ex) {
    show("empty");
    err.textContent = ex.message || "Network error. Check your connection and try again.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyse";
  }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function saveHistory(content, result) {
  if (!$("history-toggle").checked) return;
  const items = loadHistory().filter((h) => h.content !== content);
  items.unshift({ content, result, at: new Date().toISOString() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const items = loadHistory();
  $("history-empty").hidden = items.length > 0;
  $("history").replaceChildren(...items.map((h) => {
    const b = el("button", { attrs: { type: "button" } }, [
      el("span", { className: `badge ${h.result.level}`, text: `${h.result.level.toUpperCase()} ${h.result.score}` }),
      el("span", { className: "snippet", text: h.content.replace(/\s+/g, " ").slice(0, 140) }),
      el("span", { className: "small muted", text: new Date(h.at).toLocaleString() }),
    ]);
    b.addEventListener("click", () => {
      $("content").value = h.content;
      updateCount();
      renderResult(h.result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return el("li", {}, [b]);
  }));
}

function init() {
  renderSamples();
  updateCount();
  $("content").addEventListener("input", updateCount);
  $("analyze-form").addEventListener("submit", onSubmit);
  $("clear-btn").addEventListener("click", () => { $("content").value = ""; updateCount(); show("empty"); $("content").focus(); });
  const keep = localStorage.getItem(PREF_KEY);
  $("history-toggle").checked = keep !== "false";
  $("history-toggle").addEventListener("change", (e) => {
    localStorage.setItem(PREF_KEY, String(e.target.checked));
    if (!e.target.checked) { localStorage.removeItem(HISTORY_KEY); renderHistory(); }
  });
  $("history-clear").addEventListener("click", () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });
  renderHistory();
  show("empty");
}

document.addEventListener("DOMContentLoaded", init);
