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
  // Cache-bust on bundle version so browsers don't serve a stale archive
  // after a bundle rebuild. Bump this when the bundle contents change.
  const BUNDLE_VERSION = "v1.2.8-2026-05-24";
  const BUNDLE_URL = `assets/wasm/agingbench-telemetry.tar.gz?v=${BUNDLE_VERSION}`;
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
    // v1.2: auto-load the canonical sample on boot so the right panel
    // shows a live AgingCard before the visitor does anything. Replaced
    // when the user uploads + clicks Compute. Fire-and-forget — failures
    // here shouldn't block UI.
    autoLoadSample().catch(err => console.warn("auto-sample failed:", err));
  }

  async function autoLoadSample() {
    const resp = await fetch(SAMPLE_BASE + "claude_code.jsonl");
    if (!resp.ok) return;
    const text = await resp.text();
    setStatus("Showing sample claude_code card — upload your trace to see your own.", "ready");
    await runFromText(text, "claude_code", "code_assistant");
    // Don't pre-set the format dropdown — leave it at user-selectable default
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

  // v1.2: "Telemetry summary" — replaces the older Cost & efficiency block.
  // Surfaces aging-detected (moved here from the dropped Headline section)
  // alongside the cost/efficiency aggregates so users see one bottom-of-card
  // summary strip.
  function renderCost(card) {
    const c = card.cost_and_efficiency || {};
    const h = card.headline || {};
    const block = $("#telem-cost-block");
    if (!block) return;
    const agingDetected = h.aging_detected == null ? "—" : (h.aging_detected ? "yes" : "no");
    const agingClass = h.aging_detected === true ? "telem-aging-yes"
                    : h.aging_detected === false ? "telem-aging-no" : "";
    block.innerHTML = `
      <div title="Boolean. True when decay_slope < -0.01 OR (m0 − m_final)/m0 ≥ 0.10. Set by aging_card.py heuristic."><span>aging detected</span><strong class="${agingClass}">${agingDetected}</strong></div>
      <div><span>input tokens</span><strong>${fmt(c.total_input_tokens)}</strong></div>
      <div><span>output tokens</span><strong>${fmt(c.total_output_tokens)}</strong></div>
      <div><span>tokens / session</span><strong>${fmt(c.tokens_per_session_mean)}</strong></div>
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
    // v1.2: per-mechanism 5-star strength meter + dominant-mechanism highlight
    const dm = audit.dominant_mechanism || {};
    const stars = _mechanismStars(mech, block, dm.dominant, dm.co_dominant || []);
    const isDom = mech === dm.dominant;
    return `
      <div class="telem-mech telem-mech-${mechClass}${isDom ? " telem-mech-dominant" : ""}">
        <h4>${label}${isDom ? ' <span class="telem-dom-tag">dominant</span>' : ""}</h4>
        <div class="telem-mech-stars" title="strength: ${stars.filled}/5 (independent signal evidence)">${stars.html}</div>
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

  // ─── v1.2: 5-star strength meter (mirrors card_render.py::_mechanism_strength) ───
  function _isDegrading(v) {
    return v === "rising_degradation" || v === "falling_degradation"
        || v === "floor_degradation"  || v === "ceiling_degradation";
  }
  function _mechanismStars(mech, b, dominant, coDom) {
    let s = 0;
    if (mech === "compression") {
      const sat = b.saturation_session_rate || 0;
      if (sat > 0.7) s += 2.5; else if (sat > 0.3) s += 1.5; else if (sat > 0.05) s += 0.5;
      if (_isDegrading(b.context_noise_verdict)) s += 1.0;
      if (_isDegrading(b.tool_argument_specificity_verdict)) s += 1.5;
    } else if (mech === "interference") {
      const kl = b.tool_kl_mean_post_baseline || 0;
      if (kl > 0.2) s += 2.5; else if (kl > 0.1) s += 1.5; else if (kl > 0.05) s += 0.5;
      if (_isDegrading(b.goal_anchor_drift_verdict)) s += 1.0;
      if (_isDegrading(b.lineage_continuity_verdict)) s += 1.0;
    } else if (mech === "revision") {
      const n = b.n_stale_propagations || 0;
      if (n > 50) s += 3.0; else if (n > 20) s += 2.5; else if (n > 5) s += 1.5; else if (n > 0) s += 0.5;
      if (_isDegrading(b.value_supersession_verdict) || _isDegrading(b.violation_trajectory_verdict)) s += 1.0;
      if ((b.n_entities_tracked || 0) >= 5) s += 0.5;
    } else if (mech === "maintenance") {
      const d = b.median_outcome_rate_delta;
      if (d != null) {
        if (d < -0.15) s += 3.0;
        else if (d < -0.05) s += 1.5;
        else if (d < -0.01) s += 0.5;
      }
      if (_isDegrading(b.intervention_rate_verdict)) s += 1.5;
    } else if (mech === "consistency") {
      // 5th sparkline: aging-happened detector. Score by drift magnitude.
      const drift = b.behavior_drift_at_repeat || 0;
      if (drift > 0.5)       s = 5.0;
      else if (drift > 0.3)  s = 4.0;
      else if (drift > 0.15) s = 3.0;
      else if (drift > 0.05) s = 2.0;
      else if (drift > 0)    s = 1.0;
    }
    if (mech === dominant) s = Math.max(s, 4.0);
    const filled = Math.max(0, Math.min(5, Math.round(s)));
    return { filled, html: "★".repeat(filled) + "☆".repeat(5 - filled) };
  }

  function _escapeHtml(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ─── v1.2: auto-detect trace adapter format from the first JSON event ───
  // Returns "claude_code" if Claude Code markers are present (sessionId +
  // parentUuid or promptId), null otherwise (caller keeps current dropdown).
  function _detectFormat(jsonlText) {
    if (!jsonlText) return null;
    const nl = jsonlText.indexOf("\n");
    const firstLine = (nl > 0 ? jsonlText.slice(0, nl) : jsonlText).trim();
    if (!firstLine) return null;
    try {
      const ev = JSON.parse(firstLine);
      // Claude Code: emits sessionId + parentUuid/promptId on most events
      if (ev && ev.sessionId && (ev.parentUuid !== undefined || ev.promptId !== undefined)) {
        return "claude_code";
      }
      // Type-based fallback (queue-operation / assistant / user with message)
      if (ev && ev.sessionId && typeof ev.type === "string") {
        return "claude_code";
      }
    } catch (_) { /* malformed first line — give up gracefully */ }
    return null;
  }

  // ─── v1.2: render the Lifespan Card surface (headline + dominant + signature + repair) ───
  function renderTelemetryV12CardSurface(audit) {
    const surface = document.getElementById("telem-v12-surface");
    if (!surface) return;  // Older HTML; skip silently.

    const hb     = audit.headline      || {};
    const regime = audit.trace_regime  || {};
    const dm     = audit.dominant_mechanism || {};

    const parts = [];

    if (hb.label) {
      parts.push(
        `<div class="telem-v12-label" title="source: ${_escapeHtml(hb.source || "")}">${_escapeHtml(hb.label)}</div>`
      );
    }
    if (regime.adapter || regime.n_sessions != null) {
      const bits = [];
      if (regime.tool_using != null) bits.push(regime.tool_using ? "tool-using" : "chat-only");
      if (regime.n_sessions != null) bits.push(`${regime.n_sessions} sessions`);
      if (regime.outcomes)           bits.push(`outcomes:${_escapeHtml(regime.outcomes)}`);
      if (regime.adapter)            bits.push(`adapter:${_escapeHtml(regime.adapter)}`);
      parts.push(`<div class="telem-v12-regime">Trace regime: ${bits.join(" · ")}</div>`);
    }

    if (dm.dominant) {
      const scores = dm.scores || {};
      const top    = dm.dominant;
      const others = Object.entries(scores).filter(([k]) => k !== top).sort((a, b) => b[1] - a[1]);
      let runnerUp = "";
      if (others.length && others[0][1] > 0) {
        const margin = (scores[top] / others[0][1]).toFixed(2);
        runnerUp = ` vs runner-up ${_escapeHtml(others[0][0])} ${others[0][1].toFixed(2)}, margin ${margin}×`;
      }
      parts.push(
        `<div class="telem-v12-dom">Dominant mechanism: <strong>${_escapeHtml(top)}</strong>` +
        `<span class="telem-v12-dom-meta"> (score ${scores[top].toFixed(2)}${runnerUp})</span></div>`
      );
    } else if (dm.reason === "no_independent_evidence") {
      parts.push(
        `<div class="telem-v12-dom">Dominant mechanism: <em>no independent evidence</em>` +
        `<span class="telem-v12-dom-meta"> compatible: ${(dm.compatible || []).map(_escapeHtml).join(", ")}</span></div>`
      );
    }

    if (audit.signature) {
      parts.push(`<div class="telem-v12-sig">Diagnostic signature: <strong>${_escapeHtml(audit.signature)}</strong></div>`);
    }
    if (audit.repair) {
      parts.push(`<div class="telem-v12-repair">Recommended repair: ${_escapeHtml(audit.repair)}</div>`);
    }

    surface.innerHTML = parts.join("");
    surface.hidden = parts.length === 0;
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

    // v1.2: Headline section removed from the page; the v12 surface strip
    // already shows the headline label / aging trend / etc.
    renderCost(card);

    const audit = card.trace_audit || {};
    renderTelemetryV12CardSurface(audit);
    // v1.2: 4 mechanism sparklines only (consistency is summarised in the
    // v12 surface strip above; rendering a 5th sparkline duplicated info).
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

    // v1.2: synthetic-probe sections removed from the demo UI. Functions
    // below are no-ops when their target DOM elements are absent.

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
        const fileBase = btn.dataset.sample;
        setStatus(`Loading sample: ${fileBase}.jsonl…`);
        const resp = await fetch(SAMPLE_BASE + fileBase + ".jsonl");
        if (!resp.ok) { setStatus(`Sample not found.`, "error"); return; }
        const text = await resp.text();
        // v1.2: data-sample is the filename; the format is auto-detected
        // so adding new sample files doesn't require any JS change.
        const detected = _detectFormat(text) || "claude_code";
        const fmtSel = $("#telem-format");
        if (fmtSel) fmtSel.value = detected;
        await runFromText(text, detected, "code_assistant");
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
        // v1.2: auto-detect adapter format from the first event so the user
        // doesn't have to remember to change the dropdown after upload.
        // Heuristic: Claude Code events carry sessionId + parentUuid /
        // promptId. Anything else falls back to generic.
        const detected = _detectFormat(text);
        if (detected) {
          const fmtSel = $("#telem-format");
          if (fmtSel && fmtSel.value !== detected) {
            fmtSel.value = detected;
            setStatus(`Detected format: ${detected} — dropdown updated.`, "ready");
          }
        }
      });
    }

    const btn = $("#telem-compute");
    if (btn) {
      btn.disabled = true;
      btn.addEventListener("click", async () => {
        const text = upload && upload.dataset.payload;
        if (!text) { setStatus("Drop a JSONL file or pick a sample.", "error"); return; }
        await runFromText(text, $("#telem-format").value, "code_assistant");
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

    // v1.2: Save the rendered AgingCard region (#telem-card-snapshot) as PNG.
    // Lazy-loads html-to-image from CDN on first click — keeps the page-load
    // budget for users who never click the button.
    const savePng = $("#telem-save-png");
    if (savePng) {
      savePng.addEventListener("click", async () => {
        const target = document.getElementById("telem-card-snapshot");
        if (!target) return;
        savePng.disabled = true;
        const originalText = savePng.textContent;
        savePng.textContent = "Rendering…";
        try {
          const lib = await _loadHtmlToImage();
          const dataUrl = await lib.toPng(target, {
            backgroundColor: getComputedStyle(document.body).getPropertyValue("--bg") || "#ffffff",
            pixelRatio: 2,   // crisper on retina + when zoomed
          });
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = "aging_card.png";
          a.click();
        } catch (err) {
          console.error("PNG render failed:", err);
          setStatus(`PNG render failed: ${err.message || err}`, "error");
        } finally {
          savePng.disabled = false;
          savePng.textContent = originalText;
        }
      });
    }

    // v1.2: Share on X — open Twitter's web intent with a pre-filled tweet
    // built from the current card's headline + dominant mechanism.
    const shareX = $("#telem-share-twitter");
    if (shareX) {
      shareX.addEventListener("click", () => {
        if (!lastResult) return;
        const audit = (lastResult.card && lastResult.card.trace_audit) || {};
        const hb = audit.headline || {};
        const dm = audit.dominant_mechanism || {};
        const lines = ["My agent's Lifespan Card:"];
        if (hb.label)  lines.push("• " + hb.label);
        if (dm.dominant && audit.signature) {
          lines.push("• Dominant: " + dm.dominant + " (" + audit.signature + ")");
        }
        if (audit.repair) lines.push("• Repair: " + audit.repair);
        lines.push("");
        lines.push("Check yours @ AgingBench Lifespan Check");
        const text = lines.join("\n");
        const url  = "https://agingbench.github.io/telemetry.html";
        const intent =
          "https://twitter.com/intent/tweet" +
          "?text=" + encodeURIComponent(text) +
          "&url="  + encodeURIComponent(url)  +
          "&hashtags=" + encodeURIComponent("AgingBench,AgentLifespan");
        window.open(intent, "_blank", "noopener,noreferrer");
      });
    }

    // Lazy-load html-to-image (used by Save-as-PNG). 30-ish KB; only
    // fetched on first click — keeps the cold-load budget tight.
    async function _loadHtmlToImage() {
      if (window.htmlToImage) return window.htmlToImage;
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.min.js";
        s.onload  = resolve;
        s.onerror = () => reject(new Error("could not load html-to-image from CDN"));
        document.head.appendChild(s);
      });
      return window.htmlToImage;
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
