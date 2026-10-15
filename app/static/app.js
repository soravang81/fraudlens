"use strict";

const SAMPLES = [
  { label: "Bank KYC SMS", text: "Dear Customer, your SBI YONO account will be blocked today. Please update your PAN/KYC immediately: http://sbi-yono-kyc.xyz/update" },
  { label: "Arnazon renewal", text: "Arnazon Prime: your renewal payment failed. Update card details within 24 hours to avoid suspension." },
  { label: "Digital arrest", text: "This is Inspector Sharma from Mumbai Cyber Crime. A parcel with drugs was booked on your Aadhaar. You are under digital arrest. Do not tell your family. Transfer Rs 95,000 for verification or an arrest warrant will be issued." },
  { label: "Fake job", text: "Part time job! Earn Rs 3000 per day from home by liking YouTube videos. No experience required. Pay registration fee Rs 499. WhatsApp 9876543210" },
  { label: "UPI refund", text: "Your electricity refund of Rs 2,450 is approved. Enter your UPI PIN to receive the amount in the collect request sent to you." },
  { label: "Look-alike link", text: "https://paypa1-secure-login.com/signin?account=verify" },
  { label: "Phishing email", text: "From: \"HDFC Bank Security\" <alerts@hdfc-secure-mail.top>\nReply-To: support.hdfcbank@gmail.com\nSubject: Urgent: Unusual login detected\nAuthentication-Results: mx.example.com; spf=fail; dkim=none; dmarc=fail\n\nDear Customer,\nWe detected an unusual login on your NetBanking account. Your account will be suspended within 24 hours. Click here to verify your identity and confirm your debit card details: http://hdfcbank.com.verify-login.top/secure" },
  { label: "Real OTP (safe)", text: "482910 is your OTP for login to HDFC Bank NetBanking. Valid for 5 mins. Do not share this OTP with anyone. If not initiated by you, call 1800-202-6161.", safe: true },
  { label: "Normal chat (safe)", text: "Hi! Are we still meeting at the cafe at 6 today? I'll bring the documents for the flat.", safe: true },
];
const QUIZ = [
  { scam: true, text: "Dear customer, your electricity connection will be disconnected tonight at 9:30 pm as your last month bill was not updated. Call officer 9876543210 immediately." },
  { scam: false, text: "Your Amazon order #402-1234567 has been delivered. Rate your experience in the Amazon app." },
  { scam: true, text: "Arnazon: your Prime renewal failed. Update card details within 24 hours to avoid suspension: arnazon-billing.co/update" },
  { scam: false, text: "123456 is your OTP for login to ICICI Bank. Do not share it with anyone. ICICI Bank never asks for your OTP." },
  { scam: true, text: "Congratulations! You have been selected for a part time job. Earn Rs 5000 daily by rating hotels. Pay Rs 999 registration fee. Contact HR on Telegram." },
  { scam: true, text: "This is CBI Mumbai. A parcel with illegal items is booked on your Aadhaar. You are under digital arrest. Do not tell anyone or you will be arrested." },
  { scam: false, text: "Hi Riya, mom here. Dinner at 8 tonight? Bring the cake from the bakery near your office." },
  { scam: true, text: "Your PAN card is blocked. Update KYC now at http://incometax-kyc-verify.xyz" },
];
const BULK_SAMPLE = [
  "arnazon.com/order/track",
  "Your parcel is held at customs. Pay Rs 25 redelivery fee at http://indiapost-help.top",
  "Hi, are we still meeting at 6?",
  "https://www.irctc.co.in/nget/train-search",
  "G00gle security alert: unusual sign-in. Verify your account now",
  "482910 is your OTP for HDFC Bank NetBanking. Do not share this OTP with anyone.",
].join("\n");
const VIEWS = {
  overview: ["Overview", "Your checks at a glance"],
  analyse: ["Analyse", "Paste a message, email or link"],
  bulk: ["Bulk check", "Many messages at once"],
  history: ["History", "Stored only in this browser"],
  learn: ["Scam library & quiz", "Learn the patterns scammers use"],
  accuracy: ["Accuracy", "How well FraudLens is measured to work"],
};
const LEVEL_TEXT = { low: "Low risk", medium: "Medium risk — be careful", high: "High risk — likely scam" };
const LEVEL_COLOR = { high: "#f87171", medium: "#fbbf24", low: "#34d399" };
const PARTS = [
  ["wording", "Wording"], ["language_model", "Language model"], ["links", "Links"],
  ["email_headers", "Email headers"], ["combinations", "Combined signals"],
];
const SIGNAL_GROUPS = 5;
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
const svgEl = (tag, attrs) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const nextFrame = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

function countUp(node, to, { decimals = 0, suffix = "", ms = 900 } = {}) {
  if (reducedMotion) { node.textContent = to.toFixed(decimals) + suffix; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    node.textContent = (to * (1 - Math.pow(1 - t, 3))).toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

function confetti() {
  if (reducedMotion) return;
  const box = el("div", { className: "confetti" });
  const colors = ["#818cf8", "#22d3ee", "#f472b6", "#fbbf24", "#34d399"];
  for (let i = 0; i < 80; i++) {
    const p = el("i");
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${1.4 + Math.random()}s`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3200);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { attrs: { href: url, download: name } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function api(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : Array.isArray(data.detail) ? "Please check your input." : null;
    throw new Error(detail || "The analysis failed. Please try again.");
  }
  return data;
}

/* ---------- Router ---------- */
function currentView() {
  const h = location.hash.replace("#", "");
  if (VIEWS[h]) return h;
  return location.pathname === "/report" ? "accuracy" : "overview";
}

function route() {
  const v = currentView();
  for (const sec of document.querySelectorAll(".view")) sec.classList.toggle("active", sec.id === `view-${v}`);
  for (const a of document.querySelectorAll("#nav a[data-view]")) {
    a.classList.toggle("active", a.dataset.view === v);
    if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  $("view-title").textContent = VIEWS[v][0];
  $("view-sub").textContent = VIEWS[v][1];
  document.title = `${VIEWS[v][0]} — FraudLens`;
  closeMenu();
  window.scrollTo({ top: 0 });
  if (v === "overview") renderOverview();
  if (v === "history") renderHistory();
  if (v === "learn") { renderLibrary(); if (!quiz.started) renderQuiz(); }
  if (v === "accuracy") window.FraudLensReport.showAccuracy();
  if (v === "analyse") setTimeout(() => $("content").focus({ preventScroll: true }), 50);
}

function openMenu() { $("sidebar").classList.add("open"); $("scrim").classList.add("show"); $("menu-btn").setAttribute("aria-expanded", "true"); }
function closeMenu() { $("sidebar").classList.remove("open"); $("scrim").classList.remove("show"); $("menu-btn").setAttribute("aria-expanded", "false"); }

/* ---------- Analyse ---------- */
let stepTimer = null;
let lastResult = null;
let lastContent = "";

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
    stepTimer = setInterval(() => { i = Math.min(i + 1, items.length - 1); items[i].classList.add("on"); }, 200);
  }
}

function renderSamples() {
  for (const s of SAMPLES) {
    const b = el("button", { className: s.safe ? "chip safe-sample" : "chip", text: s.label, attrs: { type: "button" } });
    b.addEventListener("click", () => { $("content").value = s.text; updateCount(); $("content").focus(); });
    $("samples").appendChild(b);
  }
}

function updateCount() {
  $("char-count").textContent = `${$("content").value.length.toLocaleString()} / 20,000`;
}

function stagger(list) {
  [...list.children].forEach((c, i) => c.style.setProperty("--i", String(i)));
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

function renderMarked(r) {
  const block = $("marked-block");
  const h = r.highlights;
  if (!h || !h.text || r.input_type === "url") { block.hidden = true; return; }
  block.hidden = false;
  const box = $("marked");
  box.replaceChildren();
  let pos = 0;
  h.spans.forEach((s, i) => {
    if (s.start > pos) box.appendChild(document.createTextNode(h.text.slice(pos, s.start)));
    const m = el("mark", { className: s.kind, text: h.text.slice(s.start, s.end) });
    m.style.animationDelay = `${300 + i * 90}ms`;
    box.appendChild(m);
    pos = s.end;
  });
  if (pos < h.text.length) box.appendChild(document.createTextNode(h.text.slice(pos)));
  if (h.truncated) box.appendChild(el("span", { className: "muted", text: "\n… (only the first 5,000 characters are shown)" }));
}

function renderSignals(r) {
  const box = $("signals");
  const sig = r.signals || [];
  if (r.level === "low" || !sig.length) { box.replaceChildren(); return; }
  const dots = el("span", { className: "signal-dots", attrs: { "aria-hidden": "true" } });
  for (let i = 0; i < SIGNAL_GROUPS; i++) dots.appendChild(el("i", { className: i < sig.length ? "on" : "" }));
  const text = sig.length === 1 ? `Based on one signal (${sig[0]}); treat with care.` : `${sig.length} independent signals agree: ${sig.join(", ")}.`;
  box.replaceChildren(dots, el("span", { text }));
}

function renderBreakdown(r) {
  const b = r.breakdown;
  const block = $("breakdown-block");
  if (!b) { block.hidden = true; return; }
  const positive = PARTS.filter(([k]) => b[k] > 0);
  block.hidden = !positive.length && !b.threat_intel;
  const total = positive.reduce((s, [k]) => s + b[k], 0);
  const bar = $("breakdown-bar");
  const scale = Math.max(100, total);
  bar.replaceChildren(...positive.map(([k]) => el("span", { className: `seg ${k}`, attrs: { "data-w": String((b[k] / scale) * 100) } })));
  bar.setAttribute("aria-label", positive.map(([k, label]) => `${label} ${b[k]} points`).join(", ") || "No points added");
  nextFrame(() => { for (const seg of bar.children) seg.style.width = `${seg.dataset.w}%`; });
  const legend = positive.map(([k, label]) => el("li", { className: `key ${k}` }, [el("span", { text: label }), el("b", { text: `+${b[k]}` })]));
  const reductions = PARTS.filter(([k]) => b[k] < 0).reduce((s, [k]) => s + b[k], 0);
  if (reductions < 0) legend.push(el("li", { text: `Reassuring signs: ${reductions}` }));
  if (b.threat_intel) legend.push(el("li", { text: "Known threat-feed match: score raised to at least 90" }));
  $("breakdown-legend").replaceChildren(...legend);
}

function renderResult(r, content) {
  lastResult = r;
  lastContent = content;
  const v = $("verdict");
  v.className = "verdict";
  void v.offsetWidth;
  v.className = `verdict ${r.level}`;
  $("verdict-level").textContent = LEVEL_TEXT[r.level];
  $("verdict-summary").textContent = r.summary;
  const fill = $("gauge-fill");
  fill.style.strokeDasharray = `${GAUGE_C}`;
  fill.style.strokeDashoffset = `${GAUGE_C}`;
  nextFrame(() => { fill.style.strokeDashoffset = `${GAUGE_C * (1 - Math.max(2, r.score) / 100)}`; });
  countUp($("score-value"), r.score, { ms: 1100 });
  $("scenario-chips").replaceChildren(...r.scenarios.map((s) => el("span", { className: "chip tag", text: s.name })));
  renderSignals(r);
  renderMarked(r);
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

  $("email-block").hidden = !r.email;
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

function summaryText(r, content) {
  const lines = [`FraudLens check: ${LEVEL_TEXT[r.level]} (${r.score}/100)`, r.summary];
  if (r.scenarios.length) lines.push(`Type: ${r.scenarios.map((s) => s.name).join(", ")}`);
  const reasons = r.indicators.filter((i) => i.weight > 0).slice(0, 4).map((i) => `- ${i.label}`);
  if (reasons.length) lines.push("Why:", ...reasons);
  lines.push("What to do:", ...r.advice.slice(0, 3).map((a) => `- ${a}`));
  lines.push("", `Message checked: "${content.replace(/\s+/g, " ").slice(0, 160)}${content.length > 160 ? "…" : ""}"`);
  lines.push("Lost money? Call 1930 or report at cybercrime.gov.in");
  return lines.join("\n");
}

async function runAnalysis(content) {
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
  show("loading");
  const started = performance.now();
  try {
    const data = await api("/api/analyze", { content, live: $("live").checked });
    const wait = (reducedMotion ? 0 : 700) - (performance.now() - started);
    if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
    renderResult(data, content);
    saveHistory(content, data);
    if (window.innerWidth < 900) $("result-title").parentElement.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  } catch (ex) {
    show("empty");
    err.textContent = ex.message || "Network error. Check your connection and try again.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* ---------- History ---------- */
let historyFilter = "all";

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function storeHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 100)));
  updateNavCount();
}

function saveHistory(content, result) {
  if (!$("history-toggle").checked) return;
  const items = loadHistory().filter((h) => h.content !== content);
  items.unshift({ content, result, at: new Date().toISOString() });
  storeHistory(items);
}

function updateNavCount() {
  const n = loadHistory().length;
  $("nav-count").hidden = !n;
  $("nav-count").textContent = String(n);
}

function openFromHistory(h) {
  $("content").value = h.content;
  updateCount();
  location.hash = "analyse";
  if (h.result.partial) setTimeout(() => runAnalysis(h.content), 60);
  else setTimeout(() => renderResult(h.result, h.content), 60);
}

function historyRow(h, withDelete) {
  const b = el("button", { attrs: { type: "button" } }, [
    el("span", { className: `badge ${h.result.level}`, text: `${h.result.level.toUpperCase()} ${h.result.score}` }),
    el("span", { className: "snippet", text: h.content.replace(/\s+/g, " ").slice(0, 140) }),
    el("span", { className: "small muted", text: new Date(h.at).toLocaleString() }),
  ]);
  b.addEventListener("click", () => openFromHistory(h));
  const li = el("li", {}, [b]);
  if (withDelete) {
    const del = el("button", { className: "icon-btn", attrs: { type: "button", "aria-label": "Delete this check", title: "Delete" } });
    del.appendChild(svgEl("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2 }))
      .appendChild(svgEl("path", { d: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" }));
    del.addEventListener("click", () => {
      storeHistory(loadHistory().filter((x) => !(x.content === h.content && x.at === h.at)));
      renderHistory();
    });
    li.appendChild(del);
  }
  return li;
}

function renderHistory() {
  const q = $("history-search").value.trim().toLowerCase();
  const all = loadHistory();
  const items = all.filter((h) => (historyFilter === "all" || h.result.level === historyFilter) && (!q || h.content.toLowerCase().includes(q)));
  $("history-empty").hidden = items.length > 0;
  $("history-empty").textContent = all.length ? "No checks match this filter." : "Nothing yet. Checks you run are listed here (stored only in this browser).";
  $("history").replaceChildren(...items.map((h) => historyRow(h, true)));
  stagger($("history"));
  $("history").classList.add("stagger");
}

/* ---------- Overview ---------- */
function renderOverview() {
  const items = loadHistory();
  const counts = { high: 0, medium: 0, low: 0 };
  for (const h of items) counts[h.result.level] = (counts[h.result.level] || 0) + 1;
  countUp($("kpi-total"), items.length);
  countUp($("kpi-high"), counts.high);
  countUp($("kpi-medium"), counts.medium);
  countUp($("kpi-low"), counts.low);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ d, n: 0 });
  }
  for (const h of items) {
    const t = new Date(h.at);
    t.setHours(0, 0, 0, 0);
    const day = days.find((x) => x.d.getTime() === t.getTime());
    if (day) day.n++;
  }
  const max = Math.max(1, ...days.map((x) => x.n));
  $("activity").replaceChildren(...days.map((x) => {
    const bar = el("div", { className: x.n ? "b" : "b zero", attrs: { title: `${x.n} checks`, "data-h": String((x.n / max) * 100) } });
    return el("div", { className: "col" }, [el("small", { className: "small muted", text: x.n ? String(x.n) : "" }), bar,
      el("span", { text: x.d.toLocaleDateString(undefined, { weekday: "short" }) })]);
  }));
  nextFrame(() => { for (const b of $("activity").querySelectorAll(".b")) b.style.height = `${Math.max(3, Number(b.dataset.h))}%`; });

  const total = items.length;
  const wrap = $("donut-wrap");
  const svg = svgEl("svg", { viewBox: "0 0 120 120" });
  svg.appendChild(svgEl("circle", { cx: 60, cy: 60, r: 50, stroke: "rgba(148,163,184,.15)" }));
  const C = 2 * Math.PI * 50;
  let offset = 0;
  const arcs = [];
  for (const lvl of ["high", "medium", "low"]) {
    if (!counts[lvl]) continue;
    const len = (counts[lvl] / total) * C;
    const c = svgEl("circle", { cx: 60, cy: 60, r: 50, stroke: LEVEL_COLOR[lvl], "stroke-dasharray": `0 ${C}`, "stroke-dashoffset": String(-offset) });
    arcs.push([c, len]);
    svg.appendChild(c);
    offset += len;
  }
  const donut = el("div", { className: "donut" }, [svg, el("div", { className: "center" }, [el("div", {}, [el("b", { text: String(total) }), el("span", { className: "small muted", text: "checks" })])])]);
  const legend = el("ul", { className: "legend" }, ["high", "medium", "low"].map((lvl) =>
    el("li", { className: "key" }, [el("span", { className: `badge ${lvl}`, text: lvl }), el("b", { text: total ? `${Math.round((counts[lvl] / total) * 100)}%` : "0%" })])));
  legend.classList.add("donut-legend");
  wrap.replaceChildren(donut, legend);
  nextFrame(() => { for (const [c, len] of arcs) c.setAttribute("stroke-dasharray", `${Math.max(0, len - 2)} ${C}`); });

  const scenarioCounts = {};
  for (const h of items) for (const s of h.result.scenarios || []) scenarioCounts[s.name] = (scenarioCounts[s.name] || 0) + 1;
  const top = Object.entries(scenarioCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topMax = Math.max(1, ...top.map((x) => x[1]));
  $("scam-bars").replaceChildren(...(top.length ? top.map(([name, n]) => {
    const fillBar = el("i", { attrs: { "data-w": String((n / topMax) * 100) } });
    return el("div", { className: "hbar" }, [el("span", { text: name }), el("b", { text: String(n) }), el("div", { className: "t" }, [fillBar])]);
  }) : [el("p", { className: "empty-mini", text: "No scams detected yet. Run a few checks, or try the examples in Analyse." })]));
  nextFrame(() => { for (const i of $("scam-bars").querySelectorAll("i")) i.style.width = `${i.dataset.w}%`; });

  $("recent").replaceChildren(...(items.length ? items.slice(0, 5).map((h) => {
    const li = el("li", {}, [el("span", { className: `badge ${h.result.level}`, text: String(h.result.score) }),
      el("span", { className: "snippet", text: h.content.replace(/\s+/g, " ") })]);
    li.addEventListener("click", () => openFromHistory(h));
    return li;
  }) : [el("li", { className: "muted", text: "Your recent checks will appear here." })]));

  window.FraudLensReport.getReport().then((r) => {
    const { card } = window.FraudLensReport;
    $("mini-accuracy").replaceChildren(
      card("Unseen phishing URLs caught", r.heldout_urls.recall * 100, `precision ${(r.heldout_urls.precision * 100).toFixed(1)}%`),
      card("Email / SMS precision", r.heldout_texts.precision * 100, `${r.heldout_texts.fp} false alarms in ${r.heldout_texts.fp + r.heldout_texts.tn}`),
      card("Live phishing caught", (r.fresh_feed.recall || 0) * 100, "without the threat feed"),
      card("Average speed", r.scenarios.full.latency_ms.mean, "ms per check", { decimals: 1, suffix: " ms" }),
    );
  }).catch(() => {});
}

/* ---------- Bulk ---------- */
let bulkRows = [];

function parseBulk() {
  const raw = $("bulk-input").value;
  const parts = $("bulk-blank").checked ? raw.split(/\n\s*\n/) : raw.split("\n");
  return parts.map((s) => s.trim()).filter(Boolean);
}

async function runBulk() {
  const err = $("bulk-error");
  err.hidden = true;
  const items = parseBulk();
  if (!items.length) { err.textContent = "Add at least one message or link."; err.hidden = false; return; }
  if (items.length > 20) { err.textContent = `You entered ${items.length} items; the limit is 20 per run.`; err.hidden = false; return; }
  const btn = $("bulk-run");
  btn.disabled = true;
  $("bulk-progress").hidden = false;
  $("bulk-progress").classList.add("run");
  try {
    const data = await api("/api/batch", { items });
    bulkRows = items.map((text, i) => ({ text, ...data.results[i] }));
    const order = { high: 0, medium: 1, low: 2 };
    bulkRows.sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3) || (b.score || 0) - (a.score || 0));
    $("bulk-summary").replaceChildren(
      el("span", { className: "badge high", text: `${data.counts.high} high` }),
      el("span", { className: "badge medium", text: `${data.counts.medium} medium` }),
      el("span", { className: "badge low", text: `${data.counts.low} low` }),
    );
    $("bulk-body").replaceChildren(...bulkRows.map((r, i) => {
      const tr = el("tr", {}, [
        el("td", {}, [el("span", { className: `badge ${r.level || "medium"}`, text: (r.level || "error").toUpperCase() })]),
        el("td", { className: "msg", text: r.text, attrs: { title: r.text } }),
        el("td", { className: "small muted", text: r.error || (r.scenarios && r.scenarios.length ? r.scenarios.map((s) => s.name).join(", ") : r.summary) }),
        el("td", { className: "num", text: r.score != null ? String(r.score) : "—" }),
      ]);
      tr.style.animationDelay = `${i * 50}ms`;
      tr.addEventListener("click", () => { $("content").value = r.text; updateCount(); location.hash = "analyse"; runAnalysis(r.text); });
      tr.title = "Open the full analysis";
      return tr;
    }));
    $("bulk-results").hidden = false;
    for (const r of bulkRows) if (r.level) saveHistory(r.text, { ...r, partial: true });
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    $("bulk-progress").classList.remove("run");
    $("bulk-progress").hidden = true;
  }
}

function bulkCsv() {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [["level", "score", "type", "summary", "message"].join(",")];
  for (const r of bulkRows) lines.push([r.level, r.score, (r.scenarios || []).map((s) => s.name).join("; "), r.summary, r.text].map(esc).join(","));
  download("fraudlens-bulk.csv", lines.join("\n"), "text/csv");
}

/* ---------- Learn ---------- */
let libraryLoaded = false;
const LIB_COLORS = ["#818cf8", "#22d3ee", "#f472b6", "#fbbf24", "#34d399", "#fb7185", "#a78bfa"];

function renderLibrary() {
  if (libraryLoaded) return;
  fetch("/api/scenarios").then((r) => r.json()).then((data) => {
    libraryLoaded = true;
    $("library").replaceChildren(...data.scenarios.map((s, i) => {
      const icon = el("span", { className: "emoji", text: s.name.replace(/[^A-Za-z]/g, "").charAt(0) });
      icon.style.color = LIB_COLORS[i % LIB_COLORS.length];
      const card = el("button", { className: "lib-card", attrs: { type: "button", "aria-expanded": "false" } }, [
        icon, el("h4", { text: s.name }), el("span", { className: "more", text: "What to do →" }),
        el("ul", {}, s.advice.map((a) => el("li", { text: a }))),
      ]);
      card.addEventListener("click", () => {
        const open = card.classList.toggle("open");
        card.setAttribute("aria-expanded", String(open));
        card.querySelector(".more").textContent = open ? "Hide" : "What to do →";
      });
      return card;
    }));
  }).catch(() => {});
}

const quiz = { i: 0, answers: [], started: false };

function quizProgress() {
  return el("div", { className: "q-progress", attrs: { "aria-hidden": "true" } }, QUIZ.map((_, i) =>
    el("i", { className: i < quiz.answers.length ? (quiz.answers[i] ? "right" : "wrong") : i === quiz.i ? "cur" : "" })));
}

function renderQuiz() {
  quiz.started = true;
  const body = $("quiz-body");
  if (quiz.i >= QUIZ.length) {
    const right = quiz.answers.filter(Boolean).length;
    const score = el("div", { className: "q-score", text: `${right} / ${QUIZ.length}` });
    const msg = right === QUIZ.length ? "Perfect! Scammers will have a hard time with you." : right >= 6 ? "Great instincts. Review the ones you missed below." : "Scams are designed to look real. The red flags below will help.";
    const again = el("button", { className: "btn-primary inline", text: "Play again", attrs: { type: "button" } });
    again.addEventListener("click", () => { quiz.i = 0; quiz.answers = []; renderQuiz(); });
    body.replaceChildren(quizProgress(), score, el("p", { text: msg }), again);
    if (right >= 6) confetti();
    return;
  }
  const item = QUIZ[quiz.i];
  const scamBtn = el("button", { className: "q-btn scam", text: "It's a scam", attrs: { type: "button" } });
  const safeBtn = el("button", { className: "q-btn safe", text: "Looks genuine", attrs: { type: "button" } });
  const actions = el("div", { className: "q-actions" }, [scamBtn, safeBtn]);
  body.replaceChildren(quizProgress(), el("div", { className: "q-msg", text: item.text }), actions);
  const answer = async (saidScam) => {
    scamBtn.disabled = safeBtn.disabled = true;
    const right = saidScam === item.scam;
    quiz.answers.push(right);
    const res = el("div", { className: `q-result ${right ? "right" : "wrong"}` }, [
      el("strong", { text: right ? "Correct! " : "Not quite. " }),
      el("span", { text: item.scam ? "This is a scam." : "This one is genuine." }),
    ]);
    body.appendChild(res);
    try {
      const r = await api("/api/analyze", { content: item.text });
      const reasons = r.indicators.filter((i) => i.weight > 0 && i.category !== "ml").slice(0, 3).map((i) => i.label.toLowerCase());
      res.appendChild(el("p", { className: "small", text: `FraudLens: ${LEVEL_TEXT[r.level]} (${r.score}/100)` + (reasons.length ? ` because of ${reasons.join("; ")}.` : ".") }));
    } catch { /* the explanation is optional */ }
    const next = el("button", { className: "btn-primary inline", text: quiz.i + 1 < QUIZ.length ? "Next message →" : "See my score", attrs: { type: "button" } });
    next.addEventListener("click", () => { quiz.i++; renderQuiz(); });
    body.appendChild(el("div", { className: "q-actions mt" }, [next]));
    next.focus();
  };
  scamBtn.addEventListener("click", () => answer(true));
  safeBtn.addEventListener("click", () => answer(false));
}

/* ---------- Init ---------- */
function init() {
  renderSamples();
  updateCount();
  updateNavCount();
  show("empty");

  window.addEventListener("hashchange", route);
  $("menu-btn").addEventListener("click", openMenu);
  $("scrim").addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  $("content").addEventListener("input", updateCount);
  $("analyze-form").addEventListener("submit", (e) => { e.preventDefault(); runAnalysis($("content").value); });
  $("content").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("analyze-form").requestSubmit(); });
  $("clear-btn").addEventListener("click", () => { $("content").value = ""; updateCount(); show("empty"); $("content").focus(); });
  $("paste-btn").addEventListener("click", async () => {
    try { $("content").value = await navigator.clipboard.readText(); updateCount(); } catch { toast("Your browser blocked clipboard access. Paste with Ctrl/⌘+V."); }
  });
  $("copy-btn").addEventListener("click", async () => {
    if (!lastResult) return;
    try { await navigator.clipboard.writeText(summaryText(lastResult, lastContent)); toast("Summary copied"); } catch { toast("Couldn't copy. Your browser blocked clipboard access."); }
  });
  $("share-btn").addEventListener("click", async () => {
    if (!lastResult) return;
    const text = summaryText(lastResult, lastContent);
    if (navigator.share) {
      try { await navigator.share({ title: "FraudLens warning", text }); } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(text); toast("Warning copied: paste it to family or friends"); } catch { toast("Sharing isn't available in this browser."); }
    }
  });
  $("download-btn").addEventListener("click", () => {
    if (!lastResult) return;
    download(`fraudlens-${lastResult.level}-${Date.now()}.json`, JSON.stringify({ content: lastContent, result: lastResult }, null, 2), "application/json");
  });

  $("quick-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("quick-input").value;
    if (!v.trim()) { $("quick-input").focus(); return; }
    $("content").value = v;
    updateCount();
    $("quick-input").value = "";
    location.hash = "analyse";
    runAnalysis(v);
  });

  $("bulk-run").addEventListener("click", runBulk);
  $("bulk-sample").addEventListener("click", () => { $("bulk-input").value = BULK_SAMPLE; $("bulk-blank").checked = false; });
  $("bulk-csv").addEventListener("click", bulkCsv);

  $("history-toggle").checked = localStorage.getItem(PREF_KEY) !== "false";
  $("history-toggle").addEventListener("change", (e) => {
    localStorage.setItem(PREF_KEY, String(e.target.checked));
    if (!e.target.checked) { localStorage.removeItem(HISTORY_KEY); updateNavCount(); renderHistory(); }
  });
  $("history-clear").addEventListener("click", () => {
    if (!loadHistory().length || confirm("Delete all checks stored in this browser?")) { localStorage.removeItem(HISTORY_KEY); updateNavCount(); renderHistory(); }
  });
  $("history-export").addEventListener("click", () => download("fraudlens-history.json", JSON.stringify(loadHistory(), null, 2), "application/json"));
  $("history-search").addEventListener("input", renderHistory);
  for (const f of document.querySelectorAll(".filter")) {
    f.addEventListener("click", () => {
      historyFilter = f.dataset.filter;
      for (const g of document.querySelectorAll(".filter")) g.classList.toggle("on", g === f);
      renderHistory();
    });
  }

  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  route();
  if (q) {
    $("content").value = q;
    updateCount();
    history.replaceState(null, "", "/app#analyse");
    route();
    runAnalysis(q);
  }
}

document.addEventListener("DOMContentLoaded", init);
