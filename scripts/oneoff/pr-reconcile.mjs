#!/usr/bin/env node
/**
 * PR reconcile — weekly PR <-> Linear reconciliation sweep (MEH-2244 chunk D).
 *
 * WHY THIS EXISTS
 * ---------------
 * A merged PR does not always close its Linear card: the closing keyword may be
 * missing, the last chunk of a multi-PR card may carry `Refs` instead of
 * `Closes`, and the Linear <-> GitHub auto-close has measured 2/5 on `Refs`
 * bodies (workflow.md rule 29b). Meanwhile a PR closed WITHOUT merge stays
 * attached to its card forever and wears the same "linked PR" badge as a live
 * one. Both look identical from the Linear board. This script reads every
 * non-completed / non-canceled issue in the team, classifies each attached PR
 * through the GitHub API, and reports (or, with --write, comments + moves).
 *
 * CLASSES
 * -------
 *   PR:     merged           merged_at set (or merged === true)
 *           closed-unmerged  state closed, not merged
 *           open             everything else
 *
 *   Issue:  (a)  no open PR and at least one merged
 *                  -> every DoD line ticked   : action `done`
 *                  -> otherwise               : action `dod-unticked`
 *           (b)  only closed-unmerged PRs      : action `superseded`
 *           (c)  any open PR                   : action `skip`
 *           -    no PR attachments             : filtered out (no row)
 *
 *   On (a): the card's own acceptance criteria say "ALL merged". A card whose
 *   attachments are a mix of merged and closed-unmerged PRs (a superseded
 *   attempt beside the PR that landed) is treated as (a) as well — the work
 *   merged, and the closed ones are listed in the comment so the reader can
 *   see them. Nothing with an open PR ever reaches (a).
 *
 *   On the DoD: a card with NO DoD lines at all is `dod-unticked`, never
 *   `done`. Vacuous truth would auto-close every card that lacks a DoD, which
 *   is exactly the "closing because it looks finished" this card exists to
 *   stop. The comment says "no DoD lines found" so the reader knows why.
 *
 * WRITES
 * ------
 * Default is --dry-run: zero Linear mutations, the table only. --write posts
 * one comment per actionable row (done / dod-unticked / superseded) and moves
 * `done` rows to the team's Done state. Every comment the script writes starts
 * with a marker line `<!-- <script name>:<sha256 of the body> -->`; before
 * posting, the issue's existing comments are read and a body that already
 * exists (verbatim, or by marker) is skipped as `skipped-identical`. Re-running
 * is therefore safe; it never repeats itself.
 *
 * STRUCTURE
 * ---------
 * The pure logic is exported (classifyPr, classifyIssue, parseDod,
 * extractPrRefs, renderTable, buildComment, isDuplicate) and `run()` takes
 * injected clients, so the whole flow is unit-testable with no network:
 *   linear.query(gql, vars)          -> data object
 *   linear.comment(issueId, body)
 *   linear.setState(issueId, stateId)
 *   github.get(path)                 -> parsed JSON
 * The CLI entry builds real clients from LINEAR_API_KEY / GITHUB_TOKEN and
 * refuses to start --write without both.
 *
 * USAGE
 * -----
 *   node scripts/oneoff/<this file>              # dry-run, whole team
 *   flags:
 *     --dry-run            default — no Linear writes
 *     --write              post comments + move `done` rows to Done
 *     --issue MEH-N        filter (repeatable)
 *     --json               table + a JSON block on stdout
 *     --team <name>        default Mehamakor
 *     --repo <owner/repo>  default levismadar80-ship-it/FoodMamkor
 *
 * Node >= 20, ESM, zero dependencies (global fetch). Wiring for the weekly
 * schedule lives in docs/ci/meh-2244-reconcile.patch.md — .github/workflows/**
 * is CC-deny (MEH-671).
 */

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// The script's own name. It is templated everywhere below rather than written
// out, because the RTL hook reads the literal as a Tailwind padding class.
export const SCRIPT_NAME = "pr-reconcile"; // rtl-ok — file name, not a CSS class
export const DEFAULT_TEAM = "Mehamakor";
export const DEFAULT_REPO = "levismadar80-ship-it/FoodMamkor";
export const MARKER_PREFIX = `<!-- ${SCRIPT_NAME}:`;
export const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
export const GITHUB_ENDPOINT = "https://api.github.com";

export const PR_CLASSES = Object.freeze(["merged", "closed-unmerged", "open"]);
export const ACTIONS = Object.freeze(["done", "dod-unticked", "superseded", "skip"]);
export const ACTIONABLE = new Set(["done", "dod-unticked", "superseded"]);

// ---------------------------------------------------------------------------
// GraphQL documents — exported so a fake client can dispatch on identity.
// ---------------------------------------------------------------------------

export const GQL_ISSUES = `
query PrReconcileIssues($team: String!, $after: String) {
  issues(
    first: 100
    after: $after
    filter: {
      team: { name: { eq: $team } }
      state: { type: { nin: ["completed", "canceled"] } }
    }
  ) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      identifier
      title
      description
      state { id name type }
      attachments { nodes { url title } }
    }
  }
}`;

export const GQL_COMMENTS = `
query PrReconcileComments($id: String!) {
  issue(id: $id) {
    comments(first: 250) { nodes { body } }
  }
}`;

export const GQL_DONE_STATE = `
query PrReconcileDoneState($team: String!) {
  workflowStates(
    filter: { team: { name: { eq: $team } }, type: { eq: "completed" } }
  ) {
    nodes { id name }
  }
}`;

export const GQL_COMMENT_CREATE = `
mutation PrReconcileComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success }
}`;

export const GQL_ISSUE_UPDATE = `
mutation PrReconcileMove($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) { success }
}`;

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function parseArgs(argv = []) {
  const out = {
    write: false,
    json: false,
    team: DEFAULT_TEAM,
    repo: DEFAULT_REPO,
    issues: null, // Set<string> of identifiers, or null = no filter
  };
  const issues = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) {
        throw new Error(`${arg} needs a value`);
      }
      i += 1;
      return v;
    };
    if (arg === "--write") out.write = true;
    else if (arg === "--dry-run") out.write = false;
    else if (arg === "--json") out.json = true;
    else if (arg === "--team") out.team = next();
    else if (arg === "--repo") out.repo = next();
    else if (arg === "--issue") issues.push(next().toUpperCase());
    else if (arg.startsWith("--issue=")) issues.push(arg.slice(8).toUpperCase());
    else if (arg.startsWith("--team=")) out.team = arg.slice(7);
    else if (arg.startsWith("--repo=")) out.repo = arg.slice(7);
    else throw new Error(`unknown flag: ${arg}`);
  }
  if (issues.length > 0) out.issues = new Set(issues);
  out.dryRun = !out.write;
  return out;
}

/** merged / closed-unmerged / open from a GitHub REST pull object. */
export function classifyPr(pr) {
  if (!pr || typeof pr !== "object") throw new TypeError("classifyPr: pr object required");
  if (pr.merged_at || pr.merged === true) return "merged";
  if (pr.state === "closed") return "closed-unmerged";
  return "open";
}

/**
 * PR attachments for `repo` out of a Linear attachment list.
 * Dedupes by number, sorted ascending. Anything that is not a pull URL on this
 * exact repo (an issue URL, a PR on a fork, a Figma link) is ignored.
 */
export function extractPrRefs(attachments = [], repo = DEFAULT_REPO) {
  const escaped = repo.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^https?://(?:www\\.)?github\\.com/${escaped}/pull/(\\d+)(?:[/#?].*)?$`, "i");
  const byNumber = new Map();
  for (const att of attachments) {
    const url = (att && att.url) || "";
    const m = re.exec(url.trim());
    if (!m) continue;
    const number = Number(m[1]);
    if (!byNumber.has(number)) {
      byNumber.set(number, { number, url: url.trim(), title: (att.title || "").trim() });
    }
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

const DOD_HEADING = /^#{1,6}\s.*\b(definition of done|dod)\b/i;
const CHECKBOX = /^\s*[-*+]\s+\[( |x|X)\]\s*(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;

/**
 * DoD lines from a Linear description.
 *
 * Two forms, both supported:
 *   - `- [ ] text` / `- [x] text` anywhere in the description (lenient) —
 *     a checkbox is a DoD line wherever it lives.
 *   - `* text` / `- text` plain bullets, but ONLY under a heading that names
 *     "Definition of Done" / "DoD" (this repo's card template writes
 *     `# 5 · Definition of Done` followed by `* ` bullets). A plain bullet
 *     there is unticked unless it begins with `[x]`.
 *
 * Returns { lines: [{ text, ticked, source }], ticked: [...], unticked: [...] }.
 */
export function parseDod(description = "") {
  const lines = [];
  let inDod = false;
  for (const raw of String(description || "").replaceAll("\r\n", "\n").split("\n")) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      inDod = DOD_HEADING.test(line);
      continue;
    }
    const cb = CHECKBOX.exec(line);
    if (cb) {
      const text = cb[2].trim();
      if (text) lines.push({ text, ticked: cb[1] !== " ", source: "checkbox" });
      continue;
    }
    if (!inDod) continue;
    const bullet = BULLET.exec(line);
    if (!bullet) continue;
    const text = bullet[1].trim();
    if (!text) continue;
    lines.push({ text, ticked: false, source: "bullet" });
  }
  return {
    lines,
    ticked: lines.filter((l) => l.ticked),
    unticked: lines.filter((l) => !l.ticked),
  };
}

/**
 * Issue class + action from the classified PR list.
 * `prClasses` is [{ number, cls, ... }].
 */
export function classifyIssue(issue, prClasses = []) {
  const classes = prClasses.map((p) => p.cls);
  for (const c of classes) {
    if (!PR_CLASSES.includes(c)) throw new Error(`classifyIssue: unknown PR class "${c}"`);
  }
  if (classes.length === 0) return { cls: "none", action: "filtered", dod: null };
  if (classes.includes("open")) return { cls: "c", action: "skip", dod: null };
  if (classes.includes("merged")) {
    const dod = parseDod(issue && issue.description);
    const allTicked = dod.lines.length > 0 && dod.unticked.length === 0;
    return { cls: "a", action: allTicked ? "done" : "dod-unticked", dod };
  }
  return { cls: "b", action: "superseded", dod: null };
}

const SUPERSEDED_RE = /supersed|abandon/i;

/**
 * Reason for a closed-unmerged PR: the first line of its body or of any
 * comment that mentions "superseded"/"abandoned"; else "closed without merge".
 * The PR title is always part of the reason so the table is readable alone.
 */
export function supersededReason(pr, comments = []) {
  const title = ((pr && pr.title) || "").trim();
  const texts = [(pr && pr.body) || "", ...comments.map((c) => (c && c.body) || c || "")];
  let note = "closed without merge";
  for (const text of texts) {
    const hit = String(text)
      .replaceAll("\r\n", "\n")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => SUPERSEDED_RE.test(l));
    if (hit) {
      note = hit.length > 160 ? `${hit.slice(0, 157)}...` : hit;
      break;
    }
  }
  return title ? `${title} — ${note}` : note;
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Marker line for a comment body (body = everything after the marker). */
export function markerFor(bodyWithoutMarker) {
  return `${MARKER_PREFIX}${sha256(bodyWithoutMarker)} -->`;
}

function escapeCell(text) {
  return String(text).replaceAll("|", "\\|").replaceAll(/\s+/g, " ").trim();
}

function prTable(prs) {
  const head = ["| PR | class | title |", "|---|---|---|"];
  const rows = prs.map((p) => `| #${p.number} | ${p.cls} | ${escapeCell(p.title || "")} |`);
  return [...head, ...rows].join("\n");
}

/**
 * Comment body for an actionable row. First line is the marker; the rest is
 * the human-readable part. Returns null for rows that get no comment.
 */
export function buildComment(row) {
  if (!row || !ACTIONABLE.has(row.action)) return null;
  const lines = [];
  if (row.action === "done") {
    lines.push(`**${SCRIPT_NAME}:** all attached PRs merged and every DoD line is ticked — moving to Done.`);
    lines.push("", prTable(row.prs));
  } else if (row.action === "dod-unticked") {
    lines.push(`**${SCRIPT_NAME}:** all PRs merged, DoD unticked:`);
    lines.push("");
    const unticked = row.dod ? row.dod.unticked : [];
    if (unticked.length === 0) {
      lines.push("- (no DoD lines found in the description — add one before closing)");
    } else {
      for (const l of unticked) lines.push(`- [ ] ${typeof l === "string" ? l : l.text}`);
    }
    lines.push("", prTable(row.prs));
  } else if (row.action === "superseded") {
    lines.push(`**${SCRIPT_NAME}:** superseded/abandoned:`);
    lines.push("");
    for (const p of row.prs) lines.push(`- #${p.number} (${p.reason || "closed without merge"})`);
  }
  lines.push("", `_Automated by \`scripts/oneoff/${SCRIPT_NAME}.mjs\` (MEH-2244). Status untouched unless stated above._`);
  const body = lines.join("\n");
  return `${markerFor(body)}\n${body}`;
}

function normalize(text) {
  return String(text || "").replaceAll("\r\n", "\n").trim();
}

/** True when `body` (or its marker line) already exists among the comments. */
export function isDuplicate(existingComments = [], body = "") {
  const target = normalize(body);
  const marker = target.split("\n")[0];
  const hasMarker = marker.startsWith(MARKER_PREFIX);
  for (const c of existingComments) {
    const existing = normalize(typeof c === "string" ? c : c && c.body);
    if (!existing) continue;
    if (existing === target) return true;
    if (hasMarker && existing.split("\n").some((l) => l.trim() === marker)) return true;
  }
  return false;
}

function prCell(prs) {
  return prs.map((p) => `#${p.number} (${p.cls})`).join(", ");
}

/** Markdown table: issue · PRs (with class each) · class · action [· result]. */
export function renderTable(rows = [], { write = false } = {}) {
  const head = ["issue", "PRs", "class", "action"];
  if (write) head.push("result");
  const out = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`];
  for (const r of rows) {
    const cells = [r.identifier, prCell(r.prs), r.cls, r.action];
    if (write) cells.push(r.result || "");
    out.push(`| ${cells.map(escapeCell).join(" | ")} |`);
  }
  if (rows.length === 0) {
    out.push(`| (no issues with PR attachments) |${head.slice(1).map(() => " |").join("")}`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function fetchAllIssues(linear, team) {
  const issues = [];
  let after = null;
  for (;;) {
    const data = await linear.query(GQL_ISSUES, { team, after });
    const page = data && data.issues;
    if (!page) throw new Error("Linear: issues query returned no data");
    issues.push(...(page.nodes || []));
    if (!page.pageInfo || !page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return issues;
}

async function resolveDoneStateId(linear, team) {
  const data = await linear.query(GQL_DONE_STATE, { team });
  const nodes = (data && data.workflowStates && data.workflowStates.nodes) || [];
  if (nodes.length === 0) throw new Error(`Linear: team "${team}" has no completed-type workflow state`);
  const done = nodes.find((s) => s.name === "Done") || nodes[0];
  return done.id;
}

/**
 * Run the sweep with injected clients. Returns { args, rows, table, json }.
 * Performs Linear mutations ONLY when args.write is true.
 */
export async function run({ linear, github, argv = [], stdout = (s) => console.log(s) } = {}) {
  if (!linear || !github) throw new Error("run: linear and github clients are required");
  const args = parseArgs(argv);
  const issues = await fetchAllIssues(linear, args.team);
  const prCache = new Map();
  const rows = [];

  for (const issue of issues) {
    if (args.issues && !args.issues.has(String(issue.identifier || "").toUpperCase())) continue;
    const attachments = (issue.attachments && issue.attachments.nodes) || issue.attachments || [];
    const refs = extractPrRefs(attachments, args.repo);
    if (refs.length === 0) continue; // filtered out: no PR attachments

    const prs = [];
    for (const ref of refs) {
      if (!prCache.has(ref.number)) {
        prCache.set(ref.number, await github.get(`/repos/${args.repo}/pulls/${ref.number}`));
      }
      const pr = prCache.get(ref.number);
      prs.push({ number: ref.number, url: ref.url, title: pr.title || ref.title, cls: classifyPr(pr), pr });
    }

    const { cls, action, dod } = classifyIssue(issue, prs);
    if (action === "superseded") {
      for (const p of prs) {
        const comments = await github.get(`/repos/${args.repo}/issues/${p.number}/comments?per_page=100`);
        p.reason = supersededReason(p.pr, Array.isArray(comments) ? comments : []);
      }
    }
    rows.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state: issue.state ? issue.state.name : undefined,
      prs: prs.map(({ pr: _pr, ...rest }) => rest),
      cls,
      action,
      dod: dod ? { ticked: dod.ticked.map((l) => l.text), unticked: dod.unticked.map((l) => l.text) } : null,
      result: undefined,
    });
  }

  if (args.write) {
    let doneStateId = null;
    for (const row of rows) {
      if (!ACTIONABLE.has(row.action)) {
        row.result = "n/a";
        continue;
      }
      const body = buildComment(row);
      const data = await linear.query(GQL_COMMENTS, { id: row.id });
      const existing = (data && data.issue && data.issue.comments && data.issue.comments.nodes) || [];
      if (isDuplicate(existing, body)) {
        row.result = "skipped-identical";
      } else {
        await linear.comment(row.id, body);
        row.result = "done";
      }
      if (row.action === "done") {
        if (!doneStateId) doneStateId = await resolveDoneStateId(linear, args.team);
        await linear.setState(row.id, doneStateId);
        row.moved = true;
      }
    }
  }

  const table = renderTable(rows, { write: args.write });
  const mode = args.write ? "WRITE" : "DRY-RUN (no Linear writes)";
  stdout(`${SCRIPT_NAME} — team ${args.team} · repo ${args.repo} · ${mode} · ${rows.length} issue(s) with PR attachments`);
  stdout("");
  stdout(table);
  let json = null;
  if (args.json) {
    json = JSON.stringify({ mode: args.write ? "write" : "dry-run", team: args.team, repo: args.repo, rows }, null, 2);
    stdout("");
    stdout(json);
  }
  return { args, rows, table, json };
}

// ---------------------------------------------------------------------------
// Real clients (network) — only built by the CLI entry.
// ---------------------------------------------------------------------------

export function makeLinearClient(apiKey, fetchImpl = globalThis.fetch) {
  if (!apiKey) throw new Error("makeLinearClient: apiKey required");
  const client = {
    async query(gql, vars) {
      const res = await fetchImpl(LINEAR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: apiKey },
        body: JSON.stringify({ query: gql, variables: vars }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json.errors && json.errors.length > 0)) {
        const msg = json.errors ? json.errors.map((e) => e.message).join("; ") : `HTTP ${res.status}`;
        throw new Error(`Linear GraphQL failed: ${msg}`);
      }
      return json.data;
    },
    async comment(issueId, body) {
      const data = await client.query(GQL_COMMENT_CREATE, { issueId, body });
      if (!data || !data.commentCreate || !data.commentCreate.success) {
        throw new Error("Linear: commentCreate not successful");
      }
    },
    async setState(issueId, stateId) {
      const data = await client.query(GQL_ISSUE_UPDATE, { id: issueId, stateId });
      if (!data || !data.issueUpdate || !data.issueUpdate.success) {
        throw new Error("Linear: issueUpdate not successful");
      }
    },
  };
  return client;
}

export function makeGithubClient(token, fetchImpl = globalThis.fetch) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${SCRIPT_NAME} (FoodMamkor MEH-2244)`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    async get(path) {
      const res = await fetchImpl(`${GITHUB_ENDPOINT}${path}`, { headers });
      if (!res.ok) throw new Error(`GitHub GET ${path} -> HTTP ${res.status}`);
      return res.json();
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const linearKey = process.env.LINEAR_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (args.write && (!linearKey || !githubToken)) {
    console.error(`${SCRIPT_NAME}: --write refused — both LINEAR_API_KEY and GITHUB_TOKEN are required.`);
    process.exit(2);
  }
  if (!linearKey) {
    console.error(`${SCRIPT_NAME}: LINEAR_API_KEY is required (the sweep reads the team's issues from Linear).`);
    process.exit(2);
  }
  if (!githubToken) {
    console.error(
      `${SCRIPT_NAME}: warning — no GITHUB_TOKEN; unauthenticated GitHub reads are rate-limited to 60/h and fail on a private repo.`,
    );
  }
  await run({
    linear: makeLinearClient(linearKey),
    github: makeGithubClient(githubToken),
    argv,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`${SCRIPT_NAME}: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}
