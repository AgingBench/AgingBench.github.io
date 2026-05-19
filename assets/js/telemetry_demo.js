/* ============================================================
   AgingBench · Telemetry-mode demo (Pyodide-powered)
   ============================================================

   Loads the agingbench-telemetry Python module into Pyodide and
   exposes a button to run trace_to_card_v11() against either a
   bundled sample trace or a user-uploaded JSONL.

   Everything happens in-browser. No upload, no backend.

   Mounts: <body data-page="telemetry"> with these elements:
     #telem-status               status text
     button[data-sample]         pre-loaded sample triggers
     #telem-upload               <input type="file">
     #telem-format / #telem-profile  <select>s
     #telem-compute              ▶ button
     #telem-result               result wrapper (hidden until first run)
     [data-headline-field]       headline number slots
     #telem-mech-grid            per-mechanism trajectory cards
     #telem-cost-block           cost table
     #telem-raw-json             <pre> for full card JSON
     #telem-download             download button
   ============================================================ */

(function () {
  "use strict";

  // Skip on pages that don't carry the demo
  if (document.body.dataset.page !== "telemetry") return;

  const PYODIDE_VERSION = "0.26.4";
  const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.js`;
  const BUNDLE_URL = "assets/wasm/agingbench-telemetry.tar.gz";
  const SAMPLE_BASE = "assets/sample_traces/";

  let pyodide = null;
  let lastCardJSON = null;
  let lastResult = null;          // full {card, n_sessions, ...} payload
  let lastProbeJSON = null;       // last probe-card text the user dropped

  const $ = (sel) => document.querySelector(sel);
  const setStatus = (msg, kind = "info") => {
    const el = $("#telem-status");
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind;
  };

  // ─── 1. Load Pyodide + the agingbench bundle ───
  async function bootPyodide() {
    // file:// limitation — browsers block fetch() of local files, so
    // Pyodide and the bundle won't load. Detect early and bail out
    // with actionable remediation.
    if (window.location.protocol === "file:") {
      setStatus(
        "This page must be served over HTTP, not opened directly via file://. " +
        "From the repo root, run:    python3 -m http.server 8080    " +
        "and visit  http://localhost:8080/telemetry.html",
        "error"
      );
      return;
    }

    setStatus("Loading analysis engine (~10 MB, cached after first visit)…");
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = PYODIDE_URL;
        s.onload = resolve;
        s.onerror = () => reject(new Error("could not load Pyodide from CDN — check your internet connection"));
        document.head.appendChild(s);
      });
      pyodide = await window.loadPyodide({
        indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
      });
    } catch (err) {
      setStatus(`Pyodide failed to load: ${err.message}. Check the browser console for details.`, "error");
      throw err;
    }

    // pyyaml is the only third-party Python dep in the bundled telemetry
    // subset (used by agingbench/telemetry/profiles/__init__.py to load
    // YAML profile files). Pyodide ships it as a built-in package.
    setStatus("Loading pyyaml…");
    await pyodide.loadPackage("pyyaml");

    setStatus("Unpacking AgingBench telemetry module…");
    const resp = await fetch(BUNDLE_URL);
    if (!resp.ok) {
      throw new Error(
        `Bundle fetch failed (HTTP ${resp.status}) at ${BUNDLE_URL}. ` +
        `Make sure you're serving the site/ directory (try: python3 scripts/devserver.py)`
      );
    }
    const buf = await resp.arrayBuffer();
    pyodide.unpackArchive(buf, "tar.gz");

    // Sanity check — and force the profile to load so any remaining
    // missing-dep error surfaces here, not on the first compute click.
    pyodide.runPython(`
from agingbench.telemetry import trace_to_card_v11, list_supported_formats, load_profile
_FORMATS = list_supported_formats()
_ = load_profile("generic")
_ = load_profile("code_assistant")
    `);
    setStatus("Engine ready — pick a sample or drop a JSONL.", "ready");
    enableUI();
  }

  function enableUI() {
    document.querySelectorAll("button[data-sample], #telem-compute")
      .forEach(b => b.disabled = false);
  }

  // ─── 2. Run trace_to_card_v11 inside pyodide ───
  function computeCard(jsonlText, traceFormat, profile) {
    // Write the trace to /tmp inside Pyodide's FS
    pyodide.FS.writeFile("/tmp/trace.jsonl", jsonlText);
    pyodide.globals.set("__telem_format", traceFormat);
    pyodide.globals.set("__telem_profile", profile);
    const code = `
from agingbench.telemetry import trace_to_card_v11
import json, math
result = trace_to_card_v11(
    trace_jsonl="/tmp/trace.jsonl",
    trace_format=__telem_format,
    profile=__telem_profile,
)
# Sanitize NaN/Infinity floats; JS JSON.parse rejects the literals
# "NaN" / "Infinity" / "-Infinity" that Python's json.dumps emits by default.
def _safe_floats(o):
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _safe_floats(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_safe_floats(v) for v in o]
    return o
__telem_out = json.dumps(_safe_floats({
    "card":             result.card,
    "n_records":        result.n_records,
    "n_sessions":       result.n_sessions,
    "n_outcome_events": result.n_outcome_events,
    "session_detection_mode": result.session_detection_mode,
    "profile_used":     result.profile_used,
    "outcome_rules_hash":     result.outcome_rules_hash,
}), default=str)
    `;
    pyodide.runPython(code);
    const out = JSON.parse(pyodide.globals.get("__telem_out"));
    pyodide.runPython("del __telem_format, __telem_profile, __telem_out");
    return out;
  }

  // ─── 3. Render the result panel ───
  function fmt(v) {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
    return String(v);
  }
  function fmtMoney(v) { return v == null ? "—" : "$" + v.toFixed(4); }

  function renderHeadline(card) {
    const h = card.headline || {};
    document.querySelectorAll("[data-headline-field]").forEach(el => {
      el.textContent = fmt(h[el.dataset.headlineField]);
    });
  }

  function renderCost(card) {
    const c = card.cost_and_efficiency || {};
    const block = $("#telem-cost-block");
    if (!block) return;
    block.innerHTML = `
      <div><span>input tokens</span><strong>${fmt(c.total_input_tokens)}</strong></div>
      <div><span>output tokens</span><strong>${fmt(c.total_output_tokens)}</strong></div>
      <div><span>tokens / session</span><strong>${fmt(c.tokens_per_session_mean)}</strong></div>
      <div><span>total cost</span><strong>${fmtMoney(c.total_cost_usd)}</strong></div>
      <div><span>p50 latency</span><strong>${c.latency_ms_p50 == null ? "—" : c.latency_ms_p50 + " ms"}</strong></div>
      <div><span>p95 latency</span><strong>${c.latency_ms_p95 == null ? "—" : c.latency_ms_p95 + " ms"}</strong></div>
    `;
  }

  function sparkline(values, width = 220, height = 36) {
    const nn = (values || []).filter(v => v != null && !Number.isNaN(v));
    if (nn.length < 2) return `<svg class="telem-spark telem-spark-empty" viewBox="0 0 ${width} ${height}"></svg>`;
    const min = Math.min(...nn), max = Math.max(...nn);
    const range = (max - min) || 1;
    const step = width / Math.max(1, nn.length - 1);
    const pts = nn.map((v, i) => `${(i*step).toFixed(1)},${(height - ((v - min)/range)*height).toFixed(1)}`).join(" ");
    return `<svg class="telem-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <polyline fill="none" stroke="currentColor" stroke-width="1.6" points="${pts}"/>
    </svg>`;
  }

  function verdictPill(verdict) {
    if (!verdict) return "";
    const cls = verdict.startsWith("rising_") || verdict.startsWith("falling_") || verdict.startsWith("floor_") || verdict.startsWith("ceiling_")
      ? (verdict.endsWith("_degradation") ? "is-bad" : verdict.endsWith("_healthy") ? "is-good" : "is-neutral")
      : "is-neutral";
    return `<span class="telem-verdict ${cls}">${verdict.replaceAll("_", " ")}</span>`;
  }

  function renderMechanism(audit, mech, label, trajKey, slopeKey, verdictKey, mechClass) {
    const block = audit[mech] || {};
    const traj = block[trajKey];
    const slope = block[slopeKey];
    const verdict = block[verdictKey];
    const cov = block.coverage || {};
    return `
      <div class="telem-mech telem-mech-${mechClass}">
        <h4>${label}</h4>
        <div class="telem-mech-spark">${sparkline(traj)}</div>
        <div class="telem-mech-meta">
          <span>slope: <strong>${slope == null ? "—" : (slope >= 0 ? "+" : "") + Number(slope).toFixed(4)}</strong></span>
          ${verdictPill(verdict)}
        </div>
        <div class="telem-mech-cov">
          coverage: <strong>${cov.verdict || "—"}</strong>
          ${cov.n_observations != null ? `· n=${cov.n_observations}` : ""}
        </div>
      </div>
    `;
  }

  function renderResult(out) {
    const card = out.card;
    lastResult = out;
    lastCardJSON = JSON.stringify(card, null, 2);

    $("#telem-result").hidden = false;
    $("#telem-meta-pills").innerHTML = `
      <span>records: <strong>${out.n_records}</strong></span>
      <span>sessions: <strong>${out.n_sessions}</strong></span>
      <span>outcomes: <strong>${out.n_outcome_events}</strong></span>
      <span>sessioning: <strong>${out.session_detection_mode}</strong></span>
      <span>profile: <strong>${out.profile_used}</strong></span>
    `;

    renderHeadline(card);
    renderCost(card);

    const audit = card.trace_audit || {};
    $("#telem-mech-grid").innerHTML = [
      renderMechanism(audit, "compression",  "① Compression",
                      "context_noise_ratio_trajectory", "context_noise_slope",
                      "context_noise_verdict", "compression"),
      renderMechanism(audit, "interference", "② Interference",
                      "tool_kl_trajectory", "tool_kl_slope",
                      "goal_anchor_drift_verdict", "interference"),
      renderMechanism(audit, "revision", "③ Revision",
                      "per_session_violation_trajectory", "violation_trajectory_slope",
                      "violation_trajectory_verdict", "revision"),
      renderMechanism(audit, "maintenance", "④ Maintenance",
                      "intervention_rate_trajectory", "intervention_rate_slope",
                      "intervention_rate_verdict", "maintenance"),
    ].join("");

    renderProbes(card);
    surfaceAugmentPanel(out);

    $("#telem-raw-json").textContent = lastCardJSON;
    $("#telem-result").scrollIntoView({behavior: "smooth", block: "start"});
  }

  // ─── Render merged synthetic_probes block (one card per scenario) ───
  function renderProbes(card) {
    const block = $("#telem-probes");
    const grid  = $("#telem-probes-grid");
    if (!block || !grid) return;
    const probes = (card && card.synthetic_probes) || {};
    const keys = Object.keys(probes);
    if (keys.length === 0) { block.hidden = true; grid.innerHTML = ""; return; }
    block.hidden = false;
    grid.innerHTML = keys.map(scenarioId => {
      const p = probes[scenarioId] || {};
      const h = p.headline || {};
      return `
        <div class="telem-probe-card">
          <h4>${scenarioId}</h4>
          <dl>
            <dt>metric</dt>     <dd>${fmt(h.metric_name)}</dd>
            <dt>m_final</dt>    <dd>${fmt(h.m_final)}</dd>
            <dt>half_life</dt>  <dd>${fmt(h.half_life)}</dd>
            <dt>decay_slope</dt><dd>${fmt(h.decay_slope)}</dd>
            <dt>aging?</dt>     <dd>${fmt(h.aging_detected)}</dd>
            <dt>sessions</dt>   <dd>${fmt(p.n_sessions)}</dd>
            <dt>outcomes</dt>   <dd>${fmt(p.n_outcome_events)}</dd>
          </dl>
        </div>
      `;
    }).join("");
  }

  // ─── Surface the synthetic-probe panel when the trace is thin ───
  // Underpowered if: <3 sessions, OR any mechanism coverage.verdict is
  // "underpowered" / "no_test_fired" / "weak". We list the specific
  // reason so the user knows why they're being prompted.
  function surfaceAugmentPanel(out) {
    const panel = $("#telem-augment");
    if (!panel) return;
    const reasons = [];
    if ((out.n_sessions || 0) < 3) {
      reasons.push(`only ${out.n_sessions || 0} session(s) detected — need ≥3 for a curve`);
    }
    const audit = (out.card && out.card.trace_audit) || {};
    const weakVerdicts = ["underpowered", "no_test_fired", "weak"];
    for (const mech of ["compression", "interference", "revision", "maintenance"]) {
      const v = ((audit[mech] || {}).coverage || {}).verdict;
      if (v && weakVerdicts.includes(v)) {
        reasons.push(`${mech}: coverage ${v}`);
      }
    }
    // Re-prompting on a merged card would be silly; skip if probes already merged.
    if (out.card && out.card.synthetic_probes && Object.keys(out.card.synthetic_probes).length) {
      panel.hidden = true;
      return;
    }
    if (reasons.length === 0) { panel.hidden = true; return; }
    panel.hidden = false;
    $("#telem-augment-reason").textContent = "Why this is showing: " + reasons.join(" · ");
  }

  // ─── Merge an external probe AgingCard into the current view ───
  function mergeProbeCard(probeJSON) {
    if (!lastResult) throw new Error("No telemetry card yet — compute one first.");
    pyodide.FS.writeFile("/tmp/probe.json", probeJSON);
    pyodide.globals.set("__telem_existing", JSON.stringify(lastResult.card));
    const code = `
import json, math
from pathlib import Path
from agingbench.telemetry import load_probe_result, merge_probe_into_card
_existing = json.loads(__telem_existing)
_probe = load_probe_result(Path("/tmp/probe.json"))
_merged = merge_probe_into_card(_existing, _probe)

# Sanitize NaN/Infinity floats to None — Python's json.dumps emits the
# literals "NaN"/"Infinity"/"-Infinity" by default, which are valid Python
# but NOT valid JSON (JS JSON.parse rejects them). The probe card's
# headline.half_life is commonly Infinity (no measurable half-life in the
# run). Walk the dict once and replace.
def _safe_floats(o):
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _safe_floats(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_safe_floats(v) for v in o]
    return o
__telem_merged = json.dumps(_safe_floats(_merged), default=str)
__telem_probe_id = _probe.scenario_id
__telem_probe_n_outcomes = len(_probe.outcome_events)
    `;
    pyodide.runPython(code);
    const merged = JSON.parse(pyodide.globals.get("__telem_merged"));
    const probeId = pyodide.globals.get("__telem_probe_id");
    const probeN = pyodide.globals.get("__telem_probe_n_outcomes");
    pyodide.runPython("del __telem_existing, __telem_merged, __telem_probe_id, __telem_probe_n_outcomes");

    // Rebuild a synthetic `out` shape so renderResult can re-display.
    const mergedOut = Object.assign({}, lastResult, { card: merged });
    renderResult(mergedOut);
    setStatus(
      `Probe ${probeId} merged (${probeN} synthetic outcomes added). ` +
      `See the "synthetic_probes" block in the raw JSON below.`,
      "ready"
    );
  }

  // ─── 4. Wire up the UI ───
  async function runFromText(jsonlText, traceFormat, profile) {
    setStatus("Computing AgingCard…");
    try {
      const out = computeCard(jsonlText, traceFormat, profile);
      renderResult(out);
      setStatus(`AgingCard ready — ${out.n_records} records, ${out.n_sessions} sessions.`, "ready");
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message || err}`, "error");
    }
  }

  function bindUI() {
    document.querySelectorAll("button[data-sample]").forEach(btn => {
      btn.disabled = true;
      btn.addEventListener("click", async () => {
        const fmt = btn.dataset.sample;
        setStatus(`Loading sample: ${fmt}.jsonl…`);
        const resp = await fetch(SAMPLE_BASE + fmt + ".jsonl");
        if (!resp.ok) { setStatus(`Sample not found.`, "error"); return; }
        const text = await resp.text();
        $("#telem-format").value = fmt;
        await runFromText(text, fmt, $("#telem-profile").value);
      });
    });

    const upload = $("#telem-upload");
    if (upload) {
      upload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        $("#telem-upload-name").textContent = file.name;
        upload.dataset.payload = text;
      });
    }

    const btn = $("#telem-compute");
    if (btn) {
      btn.disabled = true;
      btn.addEventListener("click", async () => {
        const text = upload && upload.dataset.payload;
        if (!text) { setStatus("Drop a JSONL file or pick a sample.", "error"); return; }
        await runFromText(text, $("#telem-format").value, $("#telem-profile").value);
      });
    }

    const dl = $("#telem-download");
    if (dl) {
      dl.addEventListener("click", () => {
        if (!lastCardJSON) return;
        const blob = new Blob([lastCardJSON], {type: "application/json"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "aging_card.json";
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }

    // ─── Probe-card upload + merge ───
    const probeUpload = $("#telem-probe-upload");
    const probeName   = $("#telem-probe-upload-name");
    const probeMerge  = $("#telem-probe-merge");
    if (probeUpload) {
      probeUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        lastProbeJSON = await file.text();
        if (probeName) probeName.textContent = file.name;
        if (probeMerge) probeMerge.disabled = false;
      });
    }
    if (probeMerge) {
      probeMerge.addEventListener("click", () => {
        if (!lastProbeJSON) { setStatus("Drop a probe AgingCard first.", "error"); return; }
        try {
          mergeProbeCard(lastProbeJSON);
        } catch (err) {
          console.error(err);
          setStatus(`Probe merge failed: ${err.message || err}`, "error");
        }
      });
    }
  }

  // ─── 5. Start ───
  document.addEventListener("DOMContentLoaded", () => {
    bindUI();
    bootPyodide().catch(err => {
      console.error(err);
      setStatus(`Engine load failed: ${err.message || err}. The Python snippet below works as a fallback.`, "error");
    });
  });
})();
