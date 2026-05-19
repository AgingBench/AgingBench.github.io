// Self-Planning leaderboard: rows + sort logic.
// Numbers come straight from the paper's Tier 2 results table (S7 probes).
// Default sort: recall, descending. Headline metric for end-to-end self-planning quality.

const LB_ROWS = [
  { agent: "OpenHands",   agentOrg: "All Hands AI", model: "GPT-4o-mini",  org: "OpenAI",    pytest: 0.13, ws_fid: 0.88, intf: 0.33, rev_ex: 0.95, accum_err: 7.7, recall: 0.42, shock: -0.04 },
  { agent: "OpenHands",   agentOrg: "All Hands AI", model: "GPT-4o",       org: "OpenAI",    pytest: 0.65, ws_fid: 0.83, intf: 0.58, rev_ex: 0.93, accum_err: 5.8, recall: 0.46, shock:  0.14 },
  { agent: "OpenHands",   agentOrg: "All Hands AI", model: "GPT-5-mini",   org: "OpenAI",    pytest: 0.22, ws_fid: 0.85, intf: 0.63, rev_ex: 0.69, accum_err: 0.0, recall: 0.24, shock: -0.44 },
  { agent: "Claude Code", agentOrg: "Anthropic",    model: "Haiku-4.5",    org: "Anthropic", pytest: 0.91, ws_fid: 0.85, intf: 0.75, rev_ex: 1.00, accum_err: 8.7, recall: 0.63, shock: -0.23 },
  { agent: "Claude Code", agentOrg: "Anthropic",    model: "Sonnet-4.5",   org: "Anthropic", pytest: 0.78, ws_fid: 0.83, intf: 0.63, rev_ex: 1.00, accum_err: 7.5, recall: 0.69, shock: -0.17 },
  { agent: "Claude Code", agentOrg: "Anthropic",    model: "Sonnet-4.6",   org: "Anthropic", pytest: 0.83, ws_fid: 0.83, intf: 0.94, rev_ex: 1.00, accum_err: 7.0, recall: 0.75, shock: -0.11 },
  { agent: "Claude Code", agentOrg: "Anthropic",    model: "Opus-4.7",     org: "Anthropic", pytest: 0.65, ws_fid: 0.75, intf: 0.94, rev_ex: 0.92, accum_err: 5.2, recall: 0.56, shock: -0.15 },
];

// Format helpers ------------------------------------------------------------
const fmt = {
  pytest:    (v) => v.toFixed(2),
  ws_fid:    (v) => v.toFixed(2),
  intf:      (v) => v.toFixed(2),
  rev_ex:    (v) => v.toFixed(2),
  accum_err: (v) => v.toFixed(1),
  recall:    (v) => v.toFixed(2),
  shock:     (v) => (v >= 0 ? "+" + v.toFixed(2) : "−" + Math.abs(v).toFixed(2)),
};

// Numeric metric columns; used for finding the column extremum to bold.
const METRIC_KEYS = ["pytest", "ws_fid", "intf", "rev_ex", "accum_err", "recall", "shock"];

// Per-key "best" direction for highlighting the leader of each column.
// recall / pytest / ws_fid / intf / rev_ex: max. accum_err: min. shock: closest to 0.
const BEST = {
  pytest:    (rows) => Math.max(...rows.map((r) => r.pytest)),
  ws_fid:    (rows) => Math.max(...rows.map((r) => r.ws_fid)),
  intf:      (rows) => Math.max(...rows.map((r) => r.intf)),
  rev_ex:    (rows) => Math.max(...rows.map((r) => r.rev_ex)),
  accum_err: (rows) => Math.min(...rows.map((r) => r.accum_err)),
  recall:    (rows) => Math.max(...rows.map((r) => r.recall)),
  shock:     (rows) => rows.reduce((b, r) => (Math.abs(r.shock) < Math.abs(b) ? r.shock : b), rows[0].shock),
};

// Sort comparator for a given key + direction string.
// dir: "asc" | "desc" | "abs-asc"
function comparator(key, dir) {
  return (a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "string") {
      const c = av.localeCompare(bv);
      return dir === "desc" ? -c : c;
    }
    if (dir === "abs-asc") return Math.abs(av) - Math.abs(bv);
    return dir === "desc" ? bv - av : av - bv;
  };
}

let currentKey = "recall";
let currentDir = "desc";

function render() {
  const rows = LB_ROWS.slice().sort(comparator(currentKey, currentDir));

  // pre-compute column leaders for the current row set (constant; depends only on data)
  const leaders = {};
  for (const k of METRIC_KEYS) leaders[k] = BEST[k](LB_ROWS);

  const tbody = document.getElementById("lb-body");
  tbody.innerHTML = rows
    .map((r, i) => {
      const cells = METRIC_KEYS.map((k) => {
        const isLeader = r[k] === leaders[k];
        const val = fmt[k](r[k]);
        return `<td${isLeader ? ' class="lb-leader"' : ""}>${isLeader ? `<strong>${val}</strong>` : val}</td>`;
      }).join("");
      return `
        <tr>
          <td class="lb-rank">${i + 1}</td>
          <td class="lb-agent">${r.agent}</td>
          <td class="lb-model">${r.model}</td>
          <td class="lb-org">${r.org}</td>
          ${cells}
        </tr>
      `;
    })
    .join("");

  // sort indicators on header cells
  document.querySelectorAll("#lb-table th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc", "sort-abs");
    if (th.dataset.key === currentKey) {
      if (currentDir === "abs-asc") th.classList.add("sort-abs");
      else th.classList.add(currentDir === "desc" ? "sort-desc" : "sort-asc");
    }
  });
}

function bind() {
  document.querySelectorAll("#lb-table th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      const defaultDir = th.dataset.dir || "desc";
      if (currentKey === key) {
        // toggle between asc and desc on repeat click; abs-asc is one-shot.
        if (currentDir === "abs-asc") {
          currentDir = "desc";
        } else {
          currentDir = currentDir === "desc" ? "asc" : "desc";
        }
      } else {
        currentKey = key;
        currentDir = defaultDir;
      }
      render();
    });
  });
}

// ----- Track tabs (Tier 2 Agent / Tier 1 wrapper with inner sub-tabs) -----
// Outer tabs: data-track in {"agent", "tier1"}
// Inner sub-tabs (inside #track-tier1): data-t1 in {"model", "policy", "controller"}
const T1_SUBS = new Set(["model", "policy", "controller"]);

function activateTrack(track) {
  const tabs = document.querySelectorAll(".track-tab");
  const panels = document.querySelectorAll(".track-panel");
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.track === track));
  panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === track));
}

function activateT1Sub(sub) {
  const subTabs = document.querySelectorAll(".t1-tab");
  const subPanels = document.querySelectorAll(".t1-panel");
  subTabs.forEach((t) => t.classList.toggle("active", t.dataset.t1 === sub));
  subPanels.forEach((p) => p.classList.toggle("active", p.dataset.t1panel === sub));
}

function bindTrackTabs() {
  document.querySelectorAll(".track-tab").forEach((tab) => {
    tab.addEventListener("click", () => activateTrack(tab.dataset.track));
  });
  document.querySelectorAll(".t1-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTrack("tier1");
      activateT1Sub(tab.dataset.t1);
    });
  });

  // Honor #track-<name> deep links on initial load and hashchange.
  // Legacy hashes (#track-model, #track-policy, #track-controller) route to
  // the tier1 outer tab plus the matching inner sub-tab.
  function applyHash() {
    const m = window.location.hash.match(/^#track-([a-z0-9]+)$/i);
    if (!m) return;
    const name = m[1].toLowerCase();
    if (T1_SUBS.has(name)) {
      activateTrack("tier1");
      activateT1Sub(name);
    } else {
      activateTrack(name);
    }
  }
  applyHash();
  window.addEventListener("hashchange", applyHash);
}

function init() {
  bindTrackTabs();
  bind();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
