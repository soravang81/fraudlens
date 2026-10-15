"use strict";

const DEMOS = [
  { sender: "VM-SBIUPD", avatar: "VM", text: "Dear Customer, your SBI account will be blocked today. Update PAN/KYC now: http://sbi-kyc-update.xyz" },
  { sender: "+91 98xxx 21034", avatar: "+91", text: "Arnazon Prime: your renewal payment failed. Update card details within 24 hours to avoid suspension." },
  { sender: "AX-HDFCBK", avatar: "AX", text: "482910 is your OTP for HDFC Bank NetBanking. Do not share this OTP with anyone." },
  { sender: "+91 70xxx 55120", avatar: "+91", text: "Part time job! Earn Rs 3000 per day by liking YouTube videos. Pay registration fee Rs 499." },
];
const LEVEL_TEXT = { low: "Looks safe", medium: "Be careful", high: "Likely scam" };
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const RING_C = 2 * Math.PI * 16;

function countUp(node, to, decimals, suffix, ms = 1400) {
  if (reducedMotion) { node.textContent = to.toFixed(decimals) + suffix; return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    node.textContent = (to * (1 - Math.pow(1 - t, 3))).toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function demoLoop() {
  let verdicts = null;
  try {
    const res = await fetch("/api/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: DEMOS.map((d) => d.text) }) });
    if (res.ok) verdicts = (await res.json()).results;
  } catch { /* the demo still types without verdicts */ }
  const ring = $("demo-ring");
  ring.style.strokeDasharray = `${RING_C}`;
  for (let i = 0; ; i = (i + 1) % DEMOS.length) {
    const d = DEMOS[i];
    const box = $("demo-verdict");
    box.className = "demo-verdict";
    ring.style.strokeDashoffset = `${RING_C}`;
    $("demo-sender").textContent = d.sender;
    $("demo-avatar").textContent = d.avatar;
    const textNode = $("demo-text");
    textNode.textContent = "";
    if (reducedMotion) textNode.textContent = d.text;
    else for (let c = 0; c < d.text.length; c++) { textNode.textContent += d.text[c]; await sleep(18); }
    const bubble = $("demo-bubble");
    bubble.classList.remove("scan");
    void bubble.offsetWidth;
    bubble.classList.add("scan");
    $("demo-level").textContent = "Analysing…";
    $("demo-why").textContent = "";
    $("demo-score").textContent = "";
    box.classList.add("show");
    await sleep(1200);
    const v = verdicts && verdicts[i];
    if (v && v.level) {
      box.classList.add(v.level);
      $("demo-level").textContent = `${LEVEL_TEXT[v.level]} · ${v.score}/100`;
      $("demo-why").textContent = v.scenarios && v.scenarios.length ? v.scenarios.map((s) => s.name).join(", ") : v.summary;
      countUp($("demo-score"), v.score, 0, "", 900);
      ring.style.strokeDashoffset = `${RING_C * (1 - Math.max(3, v.score) / 100)}`;
    } else {
      $("demo-level").textContent = "Open the dashboard to check";
    }
    await sleep(3600);
  }
}

function loadStats() {
  fetch("/api/report").then((r) => (r.ok ? r.json() : null)).then((r) => {
    if (!r) return;
    const set = (key, value, decimals, suffix) => countUp(document.querySelector(`.l-stat b[data-key="${key}"]`), value, decimals, suffix);
    set("urls", r.heldout_urls.recall * 100, 1, "%");
    set("texts", r.heldout_texts.precision * 100, 1, "%");
    if (r.fresh_feed && r.fresh_feed.recall != null) set("fresh", r.fresh_feed.recall * 100, 1, "%");
    set("speed", r.scenarios.full.latency_ms.mean, 1, " ms");
  }).catch(() => {});
}

function observe() {
  const nodes = document.querySelectorAll(".fade-in");
  if (!("IntersectionObserver" in window) || reducedMotion) { nodes.forEach((n) => n.classList.add("seen")); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  nodes.forEach((n, i) => { n.style.transitionDelay = `${(i % 3) * 90}ms`; io.observe(n); });
}

document.addEventListener("DOMContentLoaded", () => {
  observe();
  loadStats();
  demoLoop();
  const bar = $("topbar");
  const onScroll = () => bar.classList.toggle("scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});
