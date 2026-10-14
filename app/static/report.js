"use strict";

const $ = (id) => document.getElementById(id);
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

function el(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}

function table(headers, rows, numericFrom = 1) {
  const t = el("table");
  const thead = el("thead");
  const hr = el("tr");
  headers.forEach((h, i) => hr.appendChild(el("th", h, i >= numericFrom ? "num" : undefined)));
  thead.appendChild(hr);
  t.appendChild(thead);
  const tb = el("tbody");
  for (const r of rows) {
    const tr = el("tr");
    r.forEach((c, i) => tr.appendChild(el("td", String(c), i >= numericFrom ? "num" : undefined)));
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  return t;
}

function card(label, value, note) {
  const c = el("div", undefined, "card");
  c.appendChild(el("div", label, "small muted"));
  c.appendChild(el("div", value, "big"));
  if (note) c.appendChild(el("div", note, "small muted"));
  return c;
}

function scenarioTable(block) {
  const row = (name, m) => [name, pct(m.precision), pct(m.recall), pct(m.f1), `${m.fp} / ${m.fp + m.tn}`, `${m.fn} / ${m.fn + m.tp}`];
  return table(["Pipeline", "Precision", "Recall", "F1", "False positives", "False negatives"],
    [row("Full: rules + ML + URL + intel", block.full), row("Rules + URL only (no ML)", block.rules_only)]);
}

function errorTable(errors) {
  if (!errors.length) return el("p", "No errors.", "muted");
  return table(["ID", "Type", "Category", "Score", "Message"],
    errors.map((e) => [e.id, e.type.replace("_", " "), e.category, e.score, e.text]), 3);
}

function render(r) {
  $("generated").textContent = `Generated ${new Date(r.generated_at).toLocaleString()} · flagged = score ≥ ${r.flag_threshold}`;
  const h = r.holdout.full;
  $("headline").replaceChildren(
    card("Held-out F1", pct(h.f1), `${h.n} unseen messages/URLs`),
    card("Held-out precision", pct(h.precision), `${h.fp} false alarms`),
    card("Held-out recall", pct(h.recall), `${h.fn} scams missed`),
    card("New live phishing URLs caught", pct(r.fresh_feed.recall), `${r.fresh_feed.detected} of ${r.fresh_feed.n}, feed not used`),
    card("Average speed", `${r.scenarios.full.latency_ms.mean} ms`, `per item, p95 ${r.scenarios.full.latency_ms.p95} ms (no live check)`),
  );
  $("holdout-desc").textContent = `${r.holdout.description} Written after development finished; only the text-ML weight was changed after its first run (see Limitations).`;
  $("holdout-table").replaceChildren(scenarioTable(r.holdout));
  $("holdout-errors").replaceChildren(errorTable(r.holdout.full.errors));
  $("dev-table").replaceChildren(scenarioTable(r.scenarios));
  $("dev-errors").replaceChildren(errorTable(r.scenarios.full.errors));

  const u = r.heldout_urls, t = r.heldout_texts;
  $("public-table").replaceChildren(table(["Test", "N", "Precision", "Recall", "F1", "False-positive rate", "False-negative rate"], [
    ["URLs not used in training", u.n, pct(u.precision), pct(u.recall), pct(u.f1), pct(u.false_positive_rate), pct(u.false_negative_rate)],
    ["Held-out emails / SMS", t.n, pct(t.precision), pct(t.recall), pct(t.f1), pct(t.false_positive_rate), pct(t.false_negative_rate)],
  ]));
  $("fresh").textContent = `New attacks: ${r.fresh_feed.detected} of ${r.fresh_feed.n} live OpenPhish URLs (${pct(r.fresh_feed.recall)}) were flagged without using the feed itself.`;

  const ml = r.ml_models;
  $("ml-table").replaceChildren(table(["Model", "N", "Precision", "Recall", "F1", "ROC AUC", "FPR", "FNR"],
    ["text", "url"].map((k) => [k, ml[k].n, pct(ml[k].precision), pct(ml[k].recall), pct(ml[k].f1), ml[k].roc_auc.toFixed(3), pct(ml[k].false_positive_rate), pct(ml[k].false_negative_rate)])));

  const c = r.intel.counts || {};
  $("intel").textContent = `Feeds fetched ${r.intel.fetched_at}: ${c.openphish_urls ?? 0} OpenPhish URLs, ${c.urlhaus_urls ?? 0} URLhaus malware URLs, ${c.bad_hosts ?? 0} known-bad hosts, ${c.top_domains ?? 0} top domains (Tranco) for reputation.`;
  $("limitations").replaceChildren(...r.limitations.map((x) => el("li", x)));
}

fetch("/api/report")
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Report not available yet."))))
  .then(render)
  .catch((e) => {
    $("generated").textContent = "";
    $("report-error").textContent = e.message;
    $("report-error").hidden = false;
  });
