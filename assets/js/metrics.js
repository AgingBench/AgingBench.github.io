// Metric dictionary sourced from paper Appendix B (Headline Metric Definitions and
// Mechanism-Specific Metrics). Each entry powers a hover tooltip.
const METRICS = {
  kw_m: {
    full: "keyword_m(t)",
    scenario: "S1 · Research Literature",
    mechanism: "Compression",
    direction: "higher is better",
    formula: "|K≤t ∩ eval_text(t)| / |K≤t|",
    description: "Fraction of cohort keywords introduced by cycle t that still appear (case-insensitive substring) in the agent's response. Probes survival of specific tokens (numbers, names, version pins) under write-time compression.",
    example: "If the source document specifies \u201CPostgreSQL 15\u201D and the agent answers \u201Cmodern relational database stack,\u201D the keyword token \u201CPostgreSQL 15\u201D is not present \u2192 this probe scores 0."
  },
  prec: {
    full: "constraint_precision(t)",
    scenario: "S2 · Lifestyle Assistant",
    mechanism: "Compression (silent)",
    direction: "higher is better",
    formula: "#probes citing a specific target value / #probes with a target",
    description: "Fraction of probes whose response contains at least one specific constraint value (a dollar amount, a date, a named entity). Distinguishes plausible-but-vague answers from answers that name the binding fact.",
    example: "Probe asks about Jordan's dining budget. \u201CCheck your budget before ordering\u201D scores 0; \u201CYour $173 monthly limit\u201D scores 1. Generic caution does not count."
  },
  fidel: {
    full: "summarization_fidelity(t)",
    scenario: "S3 · Project Knowledge Base",
    mechanism: "Compression + Interference",
    direction: "higher is better",
    formula: "|{d ∈ D* : ∃ k ∈ kw(d), k ∈ M_t}| / |D*|",
    description: "Fraction of gold decisions whose at least one keyword survives in the compressed memory store M_t. Optional embedding-similarity fallback at threshold 0.60 catches paraphrases.",
    example: "If decision D02 (\u201CFastAPI selected as backend framework\u201D) has keyword set {FastAPI} and FastAPI no longer appears in M_t, this decision counts as lost."
  },
  dep_rec: {
    full: "dep_recall(t)",
    scenario: "S4 · Software Engineering",
    mechanism: "Interference",
    direction: "higher is better",
    formula: "min(1, |D_t ∩ out(t)| / max(0.3·|D_t|, 1))",
    description: "Fraction of dependency keywords from the prior sprint's design notes that the agent surfaces in this sprint's output. Saturates at 30% match so partial recall counts.",
    example: "Prior sprint introduced helper functions {validate_email, normalize_phone, geocode_address}. Current sprint output mentions validate_email and geocode_address \u2192 2/3 = 0.67, normalized to ~1.0 via the saturating bound."
  },
  s6_recall: {
    full: "recall_rate(t)",
    scenario: "S6 · Naturalistic Multi-Domain",
    mechanism: "Interference",
    direction: "higher is better",
    formula: "(1/|P_<t|) Σ_{p ∈ P_<t} recalled(p)",
    description: "Average over recall probes for facts introduced in earlier sessions (0..t-1). recalled(p) is binary from keyword match against the reference answer. The longer the deployment, the more facts in the running average.",
    example: "By session 14, the agent is asked to recall 60 prior facts spread across personal, work, and household domains. If 36 are correctly recalled, recall_rate(14) = 0.60."
  },
  accum_err: {
    full: "accumulator_error(t)",
    scenario: "S2 · Lifestyle Assistant",
    mechanism: "Revision",
    direction: "lower is better",
    formula: "|v_agent(t) − v_gold(t)|",
    description: "Absolute error between the agent's reported running total and the ground-truth value computed from the full delta history. Catches compounding drift that keyword recall would miss.",
    example: "User adds $50 + $80 + $64 + $30 across 8 sessions on a $1,000 budget. Gold balance = $776. If the agent reports $840, accumulator_error = |840 − 776| = 64."
  },
  s7_recall: {
    full: "recall_accuracy(t)",
    scenario: "S7 · Self-Planning Agent",
    mechanism: "Self-managed retrieval",
    direction: "higher is better",
    formula: "(1/|P_t|) Σ_{p ∈ P_t} s(p)",
    description: "Average per-probe recall score in session t over the agent-managed workspace. Each s(p) ∈ [0,1] from keyword match. Probes are answered through the agent's own tool-calling loop, not by direct memory lookup.",
    example: "Agent uses fs_read('notes/budgets.md') and grep('Q1') to answer the probe. If 4 of 5 expected keywords appear in the final answer, s(p) = 0.8."
  },
  shock: {
    full: "Δshock",
    scenario: "S6 / S7 · Maintenance probes",
    mechanism: "Maintenance",
    direction: "negative = damage; positive = restoration (rare)",
    formula: "m_F(post-shock) − m_F(pre-shock)",
    description: "Per-model headline-metric difference across a maintenance event (recompact, flush_history, prompt_swap). Tier 1 reports two values: (recompact / flush_history). Negative values mean the routine maintenance routine degraded the agent.",
    example: "gpt-oss-120B on S6: m_F = 0.42 before recompact at session 4, 0.21 after \u2192 Δshock = −0.21. The recompact prompt rewrote the conversation summary in a way that lost mid-deployment facts."
  },
  pytest: {
    full: "pytest m_F",
    scenario: "S7 · Self-Planning Agent",
    mechanism: "Compression (downstream-task)",
    direction: "higher is better",
    formula: "fraction of held-out pytest cases passing under the aged workspace",
    description: "Tier-2 downstream signal. After the agent has managed its own workspace for N sessions, run a fresh pytest suite that exercises the codebase the agent has been editing. Tests pass only if the workspace remains coherent.",
    example: "Agent at session 8 has been editing src/billing.py across many tasks. The held-out test suite calls bill.charge(\u2026) and expects a stable interface. If the agent silently renamed charge \u2192 process_charge somewhere along the way, the test fails."
  },
  ws_fid: {
    full: "workspace_fidelity",
    scenario: "S7 · Self-Planning Agent",
    mechanism: "Write quality",
    direction: "higher is better",
    formula: "fraction of gold facts present (verbatim or paraphrased) in the agent-written workspace at session t",
    description: "Static probe of the workspace file contents. Independent of whether the agent retrieves the fact at probe time. Pairs with recall_acc to localize the bottleneck.",
    example: "If 18 of 20 gold facts are written somewhere in the workspace files but only 12 are retrieved at probe time, ws_fid = 0.90 while recall_acc = 0.60 \u2014 the gap implicates the retrieval (read) stage, not the write stage."
  },
  intf: {
    full: "interference m_F",
    scenario: "S7 · Self-Planning Agent",
    mechanism: "Interference",
    direction: "higher is better",
    formula: "fraction of probes where the agent surfaces the correct entity from a confusable pair",
    description: "Tests whether the autonomous agent picks the right fact when the workspace contains a lexically similar distractor.",
    example: "Two notes: \u201CProject Atlas: OAuth via Auth0\u201D and \u201CProject Borealis: Cognito + JWT.\u201D Probe: \u201CAtlas auth?\u201D Correct answer cites Auth0; if agent surfaces Cognito, probe scores 0."
  },
  rev_ex: {
    full: "revision_explicit m_F",
    scenario: "S7 · Self-Planning Agent",
    mechanism: "Revision (explicit)",
    direction: "higher is better",
    formula: "fraction of post-update probes where the agent cites the new value, not the stale one",
    description: "Explicit-revision variant of S7's recall: a fact is updated mid-deployment and the probe asks for the current value. Distinct from accum_err which targets derived running-totals.",
    example: "Workspace fact \u201Cdining_budget = $173\u201D is replaced at session 6 by \u201Cdining_budget = $215.\u201D Probe at session 9 asks \u201CWhat\u2019s the dining budget?\u201D If the agent answers $173, the probe scores 0."
  },
  s7p_recall: {
    full: "S7 recall m_F",
    scenario: "S7 · Self-Planning Agent",
    mechanism: "Self-managed retrieval",
    direction: "higher is better",
    formula: "(1/|P_t|) Σ s(p) over S7 probes",
    description: "Same family as recall_accuracy but re-scoped to the S7 probe suite (research-notes plus maintenance-shock probes). Not directly comparable to Tier-1 recall.",
    example: "Same kind of measurement as the runner-controlled recall column, but graded against probes specifically designed to stress autonomous-agent failure modes."
  },
  cvr: {
    full: "CVR(t)",
    scenario: "S2 · Lifestyle Assistant",
    mechanism: "Behavioral compliance",
    direction: "lower is better",
    formula: "n_violated / 10",
    description: "Constraint Violation Rate. For each of the 10 eval probes, the response is checked against violation-pattern and anti-violation-pattern regexes. CVR is the fraction of probes where the agent took the violating action.",
    example: "Probe: \u201COrder me an Uber to the airport.\u201D If the agent says \u201CBooked your Uber for 6 AM\u201D it violates the always-Lyft constraint. CVR is the rate of this kind of explicit violation, distinct from constraint_precision."
  }
};

(() => {
  let tooltip = null;
  let hideTimer = null;

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "metric-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.addEventListener("mouseenter", () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    });
    tooltip.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function render(meta) {
    return `
      <div class="mt-head">
        <span class="mt-name">${meta.full}</span>
        <span class="mt-arrow ${meta.direction.startsWith("higher") ? "up" : meta.direction.startsWith("lower") ? "down" : "neutral"}">
          ${meta.direction.startsWith("higher") ? "↑ higher is better" : meta.direction.startsWith("lower") ? "↓ lower is better" : meta.direction}
        </span>
      </div>
      <div class="mt-meta"><span class="mt-tag">${meta.scenario}</span><span class="mt-tag mt-mech">${meta.mechanism}</span></div>
      <div class="mt-formula"><code>${meta.formula}</code></div>
      <p class="mt-desc">${meta.description}</p>
      <div class="mt-example"><span class="mt-example-label">Example</span> ${meta.example}</div>
    `;
  }

  function position(target) {
    const r = target.getBoundingClientRect();
    const tipR = tooltip.getBoundingClientRect();
    const margin = 10;
    const vw = window.innerWidth;

    let top = r.bottom + window.scrollY + margin;
    let left = r.left + window.scrollX + r.width / 2 - tipR.width / 2;

    // clamp horizontally
    if (left < 12) left = 12;
    if (left + tipR.width > vw - 12) left = vw - 12 - tipR.width;

    // flip above target if no room below
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < tipR.height + margin && r.top > tipR.height + margin) {
      top = r.top + window.scrollY - tipR.height - margin;
      tooltip.classList.add("flip-up");
    } else {
      tooltip.classList.remove("flip-up");
    }

    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
  }

  function show(e) {
    const target = e.currentTarget;
    const key = target.dataset.metric;
    const meta = METRICS[key];
    if (!meta) return;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    ensureTooltip();
    tooltip.innerHTML = render(meta);
    tooltip.classList.add("visible");
    // measure after render
    requestAnimationFrame(() => position(target));
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (tooltip) tooltip.classList.remove("visible");
    }, 120);
  }

  function bind() {
    document.querySelectorAll("[data-metric]").forEach((el) => {
      el.addEventListener("mouseenter", show);
      el.addEventListener("mouseleave", scheduleHide);
      el.addEventListener("focus", show);
      el.addEventListener("blur", scheduleHide);
      el.tabIndex = 0;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
