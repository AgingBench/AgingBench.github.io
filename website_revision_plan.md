# AgingBench Website Revision Plan

Handoff for collaborator: revise `AgingBench.github.io/` to align with the new paper framing and atlas's release directives.

---

## Context

Atlas's release directive (from [`release_comments.md` line 9](release_comments.md#L9)):

> *"After the paper pass, please update the website to match the same framing. The site should not just say 'benchmark suite.' It should sell the category clearly: AI agents have lifespans, AgingBench measures them. You also need stronger visual hook on web/tweet — ideally, animation, not static image!"*

The paper has been substantively updated to atlas's new framing. Key story elements (from `release_comments.md` line 8):

| Element | Role |
|---|---|
| **agent aging** | phenomenon |
| **agent lifespan engineering (ALE)** | category / discipline |
| **AgingBench** | benchmark foundation |
| **temporal DAGs** | measure mechanisms |
| **counterfactual probes** | diagnose where repair should target |

Plus atlas's "best point" to pull forward wherever possible: ***"same wrong answer, incompatible repairs."***

The paper's softened §5 attribution language is the canonical version — the website's docs page currently uses pre-softening language that contradicts it.

**Source of truth for paper text:** `/ssd1/jianing/project/aging_arxiv/aging_arxiv.tex`
**Source of truth for atlas's directives:** `/ssd1/jianing/project/aging_arxiv/release_comments.md`

---

## ✅ Already done (do NOT change)

These have already been updated and verified — leave them alone:

- `index.html` hero title + FontAwesome icon ([L51](../AgingBench.github.io/index.html#L51))
- `index.html` hero tagline using atlas's slogan ([L52](../AgingBench.github.io/index.html#L52))
- `index.html` abstract section (full replacement with paper's new abstract, [L104-106](../AgingBench.github.io/index.html#L104-L106))
- `index.html` BibTeX citation title ([L400](../AgingBench.github.io/index.html#L400))
- `index.html` meta description + OG description ([L7, L11](../AgingBench.github.io/index.html#L7))
- `index.html` "Same wrong answer, incompatible repairs" analysis card ([L386](../AgingBench.github.io/index.html#L386))
- FontAwesome CDN loaded ([L24](../AgingBench.github.io/index.html#L24))

---

## 🔴 Priority 1 — Critical fixes (directly contradicts paper)

### 1.1 docs.html `§Counterfactual Diagnosis` — full rewrite

**File:** `docs.html` lines [222-256](../AgingBench.github.io/docs.html#L222-L256)

This section uses **pre-softening §5 attribution language** that atlas explicitly told us to remove from the paper. The paper has been updated; the docs page has not. Anyone reading docs.html would think the paper makes strong causal claims that it actually no longer does.

**Three exact phrases atlas flagged that are still in docs.html:**

| Current text in `docs.html` | Atlas's directive | Paper's current language |
|---|---|---|
| L223: *"the remaining accuracy gap **identifies the first non-oracle component that can still explain the failure**"* | Soften to "consistent with" framing | *"the resulting accuracy gaps **point to** the first non-oracle component that is **consistent with the failure**"* (see [`aging_arxiv.tex` L774](aging_arxiv.tex#L774)) |
| L245: *"total error decomposes into **three mutually exclusive components**"* | Remove "mutually exclusive" — use "additive within conceptual pipeline" | *"Within this conceptual pipeline decomposition, the P1/P2/P3 ladder **additively accounts for** the end-to-end error across the Write, Retrieval, and Utilization stages, **yielding a stage-level diagnostic signature**"* (see [`aging_arxiv.tex` L797](aging_arxiv.tex#L797)) |
| L247-249: Hard direct causal mappings: *"Utilisation Error = ... **→ Revision aging**. LLM fails despite a perfect context."* (and parallel for Write/Read errors) | Frame as **diagnostic signatures**, not causal identifications | *"a large value is **consistent with a revision-aging signature**, where the model fails to use what it has."* / *"**pointing to a compression-aging signature** where information was already underspecified at write time"* / *"**consistent with an interference-aging signature**"* (see [`aging_arxiv.tex` L797-800](aging_arxiv.tex#L797-L800)) |
| L254: *"**isolates** maintenance aging from gradual write degradation"* | Soften (minor) | *"separates"* preferred; *"isolates"* tolerable |

**Suggested full rewrite (drop-in replacement for lines 222-256):**

```html
<h3 class="subsection">Three counterfactual probes</h3>
<p>Each probe replaces selected upstream components with oracle implementations; the resulting accuracy gaps <strong>point to the first non-oracle component that is consistent with the failure</strong>. The probes form an ablation ladder over the pipeline:</p>

<div class="attr-flow">
  <div class="attr-step"><div class="attr-num">1</div><h4>P<sub>1</sub></h4><p>Baseline execution. Agent uses its own write, retrieval, and utilisation logic. Measures <code>Acc<sub>P1</sub></code>.</p></div>
  <div class="attr-arrow" aria-hidden="true"></div>
  <div class="attr-step"><div class="attr-num">2</div><h4>P<sub>2</sub></h4><p>Oracle retrieval. Bypass ℛ — oracle extracts required facts from the agent's actual store and injects them into the prompt. Measures <code>Acc<sub>P2</sub></code>.</p></div>
  <div class="attr-arrow" aria-hidden="true"></div>
  <div class="attr-step"><div class="attr-num">3</div><h4>P<sub>3</sub></h4><p>Oracle context. Bypass 𝒲 + ℛ — gold facts injected directly into the prompt. Measures <code>Acc<sub>P3</sub></code>. Any remaining error points to utilisation.</p></div>
</div>

<table class="cost-table" style="margin-top:18px; max-width:560px;">
  <thead>
    <tr><th></th><th>Write (𝒲)</th><th>Read (ℛ)</th><th>Utilize (𝒰)</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>P<sub>1</sub></strong> baseline</td><td>Agent</td><td>Agent</td><td>Agent</td></tr>
    <tr><td><strong>P<sub>2</sub></strong> oracle retrieval</td><td>Agent</td><td>Oracle</td><td>Agent</td></tr>
    <tr><td><strong>P<sub>3</sub></strong> oracle context</td><td>Oracle</td><td>Oracle</td><td>Agent</td></tr>
  </tbody>
</table>

<h3 class="subsection">Stage-level diagnostic signatures</h3>
<p>Within this conceptual pipeline decomposition, the P<sub>1</sub>/P<sub>2</sub>/P<sub>3</sub> ladder <strong>additively accounts for</strong> the end-to-end error across the Write, Retrieval, and Utilization stages, yielding a <strong>stage-level diagnostic signature</strong> rather than a unique causal decomposition for every architecture. The three shares are read as <em>candidate failure stages</em>:</p>
<ul>
  <li><strong>Utilisation share</strong> = <code>1 − Acc<sub>P3</sub></code> → consistent with a <span class="highlight-pill revision">revision-aging signature</span> (𝒰): the model fails despite a perfect context.</li>
  <li><strong>Write share</strong> = <code>Acc<sub>P3</sub> − Acc<sub>P2</sub></code> → pointing to a <span class="highlight-pill compression">compression-aging signature</span> (𝒲): information was already underspecified at write time.</li>
  <li><strong>Read share</strong> = <code>Acc<sub>P2</sub> − Acc<sub>P1</sub></code> → consistent with an <span class="highlight-pill interference">interference-aging signature</span> (ℛ): facts in the store but retrieval failed to fetch them.</li>
</ul>

<p><strong>Maintenance aging</strong> (𝒮) is observationally aliased with the Write share — both result in missing facts in the store. AgingBench separates them <em>temporally</em>: execution-loop signatures are probed across sessions, while maintenance shocks are measured immediately across a lifecycle event at time <em>t</em>:</p>
<p style="text-align:center; font-family:var(--mono); margin: 8px 0 14px;"><code>Δ𝒮 = WriteShare(t⁺) − WriteShare(t⁻)</code></p>
<p>A discrete jump in the Write share coincident with a lifecycle event separates maintenance aging from gradual write degradation.</p>

<p class="muted-line">Implementation: <code>agingbench/diagnostics/partitioner.py</code> computes the per-session <code>DiagnosticResult</code> with all three stage shares; <code>agingbench/runner/diagnostic_mixin.py</code> drives the P<sub>1</sub>/P<sub>2</sub>/P<sub>3</sub> probe execution. The signatures are emitted to the <a href="#schema">AgingCard</a> under <code>mechanism_metrics</code>. Enable diagnostic probes with <code>--diagnose</code> on any <code>agingbench run</code> invocation.</p>
```

**Why this matters:** atlas reviewed this language at the paper level twice. Leaving the website with the contradicting version creates a reviewer-trap and confuses readers comparing the two surfaces.

---

### 1.2 docs.html scenario count inconsistency

**File:** `docs.html`

- Hero tagline at [L46](../AgingBench.github.io/docs.html#L46) says *"Seven scenarios in detail"*
- Section header at [L72](../AgingBench.github.io/docs.html#L72) says *"Eight deployment scenarios"*

**Fix:** Pick one. The paper has **7 scenarios (S1–S7)**. Update L72 to *"Seven deployment scenarios"* — unless there's actually an S8 in the codebase (please verify).

---

## 🟡 Priority 2 — Thread ALE through remaining pages

Atlas wanted ALE *"consistent throughout the rest of the paper, website, and release materials."* Currently only `index.html` mentions ALE. The other pages have no framing-level reference to the new category.

### 2.1 `use.html` hero tagline

**File:** `use.html` [L62](../AgingBench.github.io/use.html#L62)

**Current:**
> *"Three release modes, a quickstart that produces a validated `aging_card.json`, and five plug-and-play tracks so you can submit your model, your memory policy, a single component, a runtime controller, or a full autonomous agent."*

**Suggested:** add ALE phrase at the end:

> *"Three release modes, a quickstart that produces a validated `aging_card.json`, and five plug-and-play tracks so you can submit your model, your memory policy, a single component, a runtime controller, or a full autonomous agent — the full evaluation surface for **agent lifespan engineering**."*

### 2.2 `docs.html` hero tagline

**File:** `docs.html` [L46](../AgingBench.github.io/docs.html#L46)

**Current:**
> *"Seven scenarios in detail, the temporal-DAG methodology, the counterfactual diagnosis story, the AgingCard schema, contribution guide, and maintenance pledge."*

**Suggested:**

> *"Seven scenarios in detail, the temporal-DAG measurement and counterfactual diagnosis tools for **agent lifespan engineering (ALE)**, the AgingCard schema, contribution guide, and maintenance pledge."*

### 2.3 `leaderboard.html` hero tagline

**File:** `leaderboard.html` [L46](../AgingBench.github.io/leaderboard.html#L46)

**Current:**
> *"**Tier 2** evaluates autonomous agents (Claude Code, OpenHands, custom) that own their own session loop under maintenance shocks, scored on the S7 probe suite. **Tier 1** isolates one variable at a time on the `ReferenceAgent` runner: model swap, memory policy, runtime controller."*

**Suggested:** one ALE mention. Two options:

**Option A — light touch (one phrase):**
> *"AgingBench leaderboard for **agent lifespan engineering** (ALE). **Tier 2** evaluates autonomous agents..."*

**Option B — restructure first sentence:**
> *"Where deployed agents stand on **agent lifespan engineering** (ALE). **Tier 2** evaluates autonomous agents (Claude Code, OpenHands, custom)..."*

### 2.4 `telemetry.html`

**File:** `telemetry.html`

Telemetry is a technical demo page — framing-light is appropriate. No critical action, but if you want consistency, add ALE to the meta description:

**Current** ([L7](../AgingBench.github.io/telemetry.html#L7)):
> *"Score the agent you're already running. Telemetry mode maps any production trace into the AgingCard schema — runs entirely in your browser via Pyodide."*

**Suggested:**
> *"Score the agent you're already running for **agent lifespan engineering**. Telemetry mode maps any production trace into the AgingCard schema — runs entirely in your browser via Pyodide."*

---

## 🟡 Priority 3 — `index.html` remaining items

### 3.1 Sync `<title>` and social card titles to the new hero title

**File:** `index.html` [L6, L10, L15](../AgingBench.github.io/index.html#L6)

**Current (all three still say the old title):**
```html
<title>AgingBench: AI Agents Age Too</title>
<meta property="og:title" content="AgingBench: AI Agents Age Too" />
<meta name="twitter:title" content="AgingBench: AI Agents Age Too" />
```

**Suggested (match new hero title):**
```html
<title>Your AI Agents Have an Aging Problem Too · AgingBench</title>
<meta property="og:title" content="Your AI Agents Have an Aging Problem Too" />
<meta name="twitter:title" content="Your AI Agents Have an Aging Problem Too" />
```

**Why:** These three strings are what Twitter / LinkedIn / Slack / search engines unfurl as the headline. Currently they show the old framing on every share.

### 3.2 (Optional) Three-ALE-questions colorbox

The paper has a prominent colorbox at [`aging_arxiv.tex` L355-362](aging_arxiv.tex#L355-L362):

> **Agent lifespan engineering (ALE) asks three key questions:**
> 1. *How long* does a deployed agent remain reliable?
> 2. *How* does reliability decay: through *compression*, *interference*, *revision*, or *maintenance*?
> 3. *Where* should repair target: *writing*, *retrieval*, *utilization*, or the memory *lifecycle*?

**Suggested:** add a styled box on `index.html` above the four-mechanisms section. This mirrors the paper's intro framing and gives readers the ALE narrative explicitly.

### 3.3 (Optional) Mechanism section ALE anchor

**File:** `index.html` [L150-151](../AgingBench.github.io/index.html#L150-L151)

**Current section-lead:**
> *"Each mechanism is a distinct causal route to degradation. They can co-occur, but they are *conceptually orthogonal*..."*

**Suggested:** start with ALE link:

> *"These four mechanisms answer ALE's **how** question — how does reliability decay. Each is a distinct causal route to degradation. They can co-occur, but they are *conceptually orthogonal*..."*

---

## 🟢 Priority 4 — Atlas's explicit visual ask

### 4.1 Hero figure animation

**File:** `index.html` [L139-143](../AgingBench.github.io/index.html#L139-L143) (intuition figure) and/or [L153-156](../AgingBench.github.io/index.html#L153-L156) (mechanisms figure)

Atlas directive (from `release_comments.md`):
> *"you also need stronger visual hook on web/tweet — ideally, animation, not static image!"*

Currently both hero figures are static PNGs.

**Suggested options (lowest effort first):**

1. **Easy** — Convert `assets/img/fig1_updated.png` to an animated GIF showing the day-1 → day-N transition (memory clutter accumulating, signals fading, agent looping).
2. **Medium** — Animate the four-panel mechanism figure with sequential reveals.
3. **Larger** — Build a CSS/JS scrubber demo: slider control where the user moves session count and watches the agent's responses degrade. Could reuse the "Watch an agent age" tab content with a session-slider replacing the side-by-side panels.

The hero intuition figure (top of page, above the fold) is the highest-leverage spot. This is also the asset that will get embedded in tweet/blog posts.

---

## Reference: paper-side anchors

For when the collaborator needs to verify against the paper:

| What | Where in paper |
|---|---|
| New abstract (current website verbatim copy) | [`aging_arxiv.tex` L297-299](aging_arxiv.tex#L297-L299) |
| New intro (full ALE story) | [`aging_arxiv.tex` L307-405](aging_arxiv.tex#L307-L405) |
| Three ALE questions colorbox | [`aging_arxiv.tex` L355-362](aging_arxiv.tex#L355-L362) |
| Softened §5 attribution (for docs.html rewrite) | [`aging_arxiv.tex` L725-810](aging_arxiv.tex#L725-L810) |
| Diagnosis paragraph (softened) | [`aging_arxiv.tex` L795-800](aging_arxiv.tex#L795-L800) |
| Finding II ("Same wrong answer, incompatible repairs") | [`aging_arxiv.tex` L931](aging_arxiv.tex#L931) |
| Discussion appendix runtime control | [`aging_arxiv.tex` L2269-2270](aging_arxiv.tex#L2269-L2270) |

---

## Suggested order of operations

1. **Critical first:** docs.html attribution rewrite (Priority 1.1). This is the single highest-leverage fix.
2. Then: docs.html scenario count (1.2).
3. Then: thread ALE through the four remaining pages (Priority 2 — use, docs, leaderboard, telemetry hero taglines).
4. Then: index.html title-tag sync (3.1).
5. Optional polish: ALE questions colorbox + mechanism anchor (3.2, 3.3).
6. Larger: hero animation (Priority 4). Can be done in parallel.

After all this is done, the website fully aligns with the paper, atlas's framing directive is satisfied, and the only remaining release-prep tasks are the tweet draft + alliance list + paper template swap.

---

## How to verify locally

```bash
cd /ssd1/jianing/project/AgingBench.github.io/
# Open index.html in a browser to spot-check
# Run a grep for old framing leaks to make sure none survive:
grep -rE "mutually exclusive|identifies the first|can still explain|where failure originat" *.html
# Should return zero matches after the rewrite.
```

Also good for verification:
```bash
# Confirm ALE is now threaded through all pages:
grep -l "lifespan engineering" *.html
# Should list all five HTML files.
```
