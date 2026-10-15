"use strict";

const SAMPLES = [
  { label: "Bank KYC SMS", text: "Dear Customer, your SBI YONO account will be blocked today. Please update your PAN/KYC immediately: http://sbi-yono-kyc.xyz/update" },
  { label: "Digital arrest", text: "This is Inspector Sharma from Mumbai Cyber Crime. A parcel with drugs was booked on your Aadhaar. You are under digital arrest. Do not tell your family. Transfer Rs 95,000 for verification or an arrest warrant will be issued." },
  { label: "Fake job", text: "Part time job! Earn Rs 3000 per day from home by liking YouTube videos. No experience required. Pay registration fee Rs 499. WhatsApp 9876543210" },
  { label: "UPI refund", text: "Your electricity refund of Rs 2,450 is approved. Enter your UPI PIN to receive the amount in the collect request sent to you." },
  { label: "Look-alike link", text: "https://paypa1-secure-login.com/signin?account=verify" },
  { label: "Phishing email", text: "From: \"HDFC Bank Security\" <alerts@hdfc-secure-mail.top>\nReply-To: support.hdfcbank@gmail.com\nSubject: Urgent: Unusual login detected\nAuthentication-Results: mx.example.com; spf=fail; dkim=none; dmarc=fail\n\nDear Customer,\nWe detected an unusual login on your NetBanking account. Your account will be suspended within 24 hours. Click here to verify your identity and confirm your debit card details: http://hdfcbank.com.verify-login.top/secure" },
  { label: "Real OTP (safe)", text: "482910 is your OTP for login to HDFC Bank NetBanking. Valid for 5 mins. Do not share this OTP with anyone. If not initiated by you, call 1800-202-6161.", safe: true },
  { label: "Normal chat (safe)", text: "Hi! Are we still meeting at the cafe at 6 today? I'll bring the documents for the flat.", safe: true },
];
const LEVEL_TEXT = { low: "Low risk", medium: "Medium risk — be careful", high: "High risk — likely scam" };
const PARTS = [
  ["wording", "Wording"], ["language_model", "Language model"], ["links", "Links"],
  ["email_headers", "Email headers"], ["combinations", "Combined signals"],
];
const HISTORY_KEY = "fraudlens.history.v1";
const PREF_KEY = "fraudlens.keepHistory";
const GAUGE_C = 2 * Math.PI * 52;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const el = (tag, opts = {}, children = []) => {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.appendChild(c);
  return node;
};

function countUp(node, to, { decimals = 0, suffix = "", ms = 900 } = {}) {
  if (reducedMotion) { node.textContent = to.toFixed(decimals) + suffix; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = (to * eased).toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function stagger(list) {
  [...list.children].forEach((c, i) => c.style.setProperty("--i", String(i)));
}

let stepTimer = null;
function show(state) {
  $("empty-state").hidden = state !== "empty";
  $("loading").hidden = state !== "loading";
  $("result").hidden = state !== "result";
  $("field").classList.toggle("scanning", state === "loading");
  clearInterval(stepTimer);
  if (state === "loading") {
    const items = [...$("steps").children];
    items.forEach((li) => li.classList.remove("on"));
    let i = 0;
    items[0].classList.add("on");
    stepTimer = setInterval(() => { i = Math.min(i + 1, items.length - 1); items[i].classList.add("on"); }, 220);
  }
}

function renderSamples() {
  const box = $("samples");
  for (const s of SAMPLES) {
    const b = el("button", { className: s.safe ? "chip safe-sample" : "chip", text: s.label, attrs: { type: "button" } });
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

function renderBreakdown(r) {
  const b = r.breakdown;
  const block = $("breakdown-block");
  if (!b) { block.hidden = true; return; }
  const positive = PARTS.filter(([k]) => b[k] > 0);
  const total = positive.reduce((s, [k]) => s + b[k], 0);
  block.hidden = !positive.length && !b.threat_intel;
  const bar = $("breakdown-bar");
  const scale = Math.max(100, total);
  bar.replaceChildren(...positive.map(([k]) => el("span", { className: `seg ${k}`, attrs: { "data-w": String((b[k] / scale) * 100) } })));
  bar.setAttribute("aria-label", positive.map(([k, label]) => `${label} ${b[k]} points`).join(", ") || "No points added");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const seg of bar.children) seg.style.width = `${seg.dataset.w}%`;
  }));
  const legend = positive.map(([k, label]) => el("li", { className: `key ${k}` }, [el("span", { text: label }), el("b", { text: `+${b[k]}` })]));
  const reductions = PARTS.filter(([k]) => b[k] < 0).reduce((s, [k]) => s + b[k], 0);
  if (reductions < 0) legend.push(el("li", { text: `Reassuring signs: ${reductions}` }));
  if (b.threat_intel) legend.push(el("li", { text: "Known threat-feed match: score raised to at least 90" }));
  $("breakdown-legend").replaceChildren(...legend);
}

function renderResult(r) {
  const v = $("verdict");
  v.className = "verdict";
  void v.offsetWidth;
  v.className = `verdict ${r.level}`;
  $("verdict-level").textContent = LEVEL_TEXT[r.level];
  $("verdict-summary").textContent = r.summary;

  const fill = $("gauge-fill");
  fill.style.strokeDasharray = `${GAUGE_C}`;
  fill.style.strokeDashoffset = `${GAUGE_C}`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.strokeDashoffset = `${GAUGE_C * (1 - Math.max(2, r.score) / 100)}`;
  }));
  countUp($("score-value"), r.score, { ms: 1100 });

  $("scenario-chips").replaceChildren(...r.scenarios.map((s) => el("span", { className: "chip tag", text: s.name })));
  renderBreakdown(r);

  $("advice").replaceChildren(...r.advice.map((a) => el("li", { text: a })));
  stagger($("advice"));

  const list = $("indicators");
  if (!r.indicators.length && !r.urls.some((u) => u.indicators.length)) {
    list.replaceChildren(el("li", { className: "muted", text: "No warning indicators matched." }));
  } else {
    list.replaceChildren(...r.indicators.map(indicatorItem));
  }
  stagger(list);

  const emailBlock = $("email-block");
  emailBlock.hidden = !r.email;
  if (r.email) {
    const dl = $("email-meta");
    dl.replaceChildren();
    for (const [k, label] of [["from", "From"], ["reply_to", "Reply-To"], ["subject", "Subject"], ["from_domain", "Sender domain"]]) {
      if (r.email[k]) { dl.appendChild(el("dt", { text: label })); dl.appendChild(el("dd", { text: r.email[k] })); }
    }
  }

  $("url-block").hidden = !r.urls.length;
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
    if (u.ml) facts.push(`URL model: ${Math.round(u.ml.probability * 100)}% phishing-like` + (u.ml.points ? ` (${u.ml.points > 0 ? "+" : ""}${u.ml.points} pts)` : ""));
    if (u.live) {
      if (u.live.final_url && u.live.final_url !== u.url) facts.push(`Lands on: ${u.live.final_url}`);
      if (u.live.domain_age_days != null) facts.push(`Domain age: ${u.live.domain_age_days} days`);
      if (u.live.error) facts.push(`Live check: ${u.live.error}`);
    }
    if (facts.length) card.appendChild(el("ul", { className: "facts" }, facts.map((f) => el("li", { text: f }))));
    card.appendChild(el("ul", { className: "indicators" }, u.indicators.map(indicatorItem)));
    return card;
  }));
  stagger($("urls"));

  const note = r.breakdown && r.breakdown.benign_context && r.urls.length
    ? " The rest of the message reads as harmless, so links were judged on their rule checks only." : "";
  $("timing").textContent = `Analysed as ${r.input_type} in ${r.elapsed_ms} ms.${note}`;
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
  const minDelay = reducedMotion ? 0 : 700;
  const started = performance.now();
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, live: $("live").checked }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "The analysis failed. Please try again.");
    const wait = minDelay - (performance.now() - started);
    if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
    renderResult(data);
    saveHistory(content, data);
    if (window.innerWidth < 900) $("result-title").parentElement.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
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
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    });
    return el("li", {}, [b]);
  }));
}

function loadStats() {
  fetch("/api/report")
    .then((res) => (res.ok ? res.json() : null))
    .then((r) => {
      if (!r || !r.heldout_urls) return;
      $("stats").hidden = false;
      countUp($("stat-urls"), r.heldout_urls.recall * 100, { decimals: 1, suffix: "%", ms: 1400 });
      countUp($("stat-texts"), r.heldout_texts.precision * 100, { decimals: 1, suffix: "%", ms: 1400 });
      if (r.fresh_feed && r.fresh_feed.recall != null) countUp($("stat-fresh"), r.fresh_feed.recall * 100, { decimals: 1, suffix: "%", ms: 1400 });
    })
    .catch(() => {});
}

function observeFadeIns() {
  const nodes = document.querySelectorAll(".fade-in");
  if (!("IntersectionObserver" in window) || reducedMotion) { nodes.forEach((n) => n.classList.add("seen")); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
  }, { threshold: 0.15 });
  nodes.forEach((n, i) => { n.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(n); });
}

function init() {
  renderSamples();
  updateCount();
  $("content").addEventListener("input", updateCount);
  $("analyze-form").addEventListener("submit", onSubmit);
  $("content").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("analyze-form").requestSubmit();
  });
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
  loadStats();
  observeFadeIns();
}

document.addEventListener("DOMContentLoaded", init);
