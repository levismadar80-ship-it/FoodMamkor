/**
 * node --test suite for the PR <-> Linear reconciliation sweep (MEH-2244 chunk D).
 *
 * No network: every Linear / GitHub call goes through injected fakes that
 * dispatch on the exported GraphQL documents and on the REST path. Every
 * expected action lives IN the fixture (`expect:`), so the counts asserted
 * below are derived from the fixture data — not from the run's own output,
 * which a broken classifier could make trivially consistent (testing.md,
 * "an assertion entailed by the lines above it is not a check").
 *
 * Red control (testing.md, MEH-1619): with `classifyIssue` forced to return
 * `skip` for everything, the per-issue expectations and the write-mode counts
 * go red. Recorded in the PR body.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIONABLE,
  GQL_COMMENTS,
  GQL_DONE_STATE,
  GQL_ISSUES,
  MARKER_PREFIX,
  buildComment,
  classifyIssue,
  classifyPr,
  extractPrRefs,
  isDuplicate,
  parseArgs,
  parseDod,
  renderTable,
  run,
  supersededReason,
} from "../pr-reconcile.mjs"; // rtl-ok — module path, not a Tailwind class

const REPO = "levismadar80-ship-it/FoodMamkor";
const pull = (n) => `https://github.com/${REPO}/pull/${n}`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** GitHub REST pull objects, keyed by number. */
const PRS = {
  3001: { number: 3001, title: "feat: first half", state: "closed", merged_at: "2026-08-20T10:00:00Z", merged: true },
  3002: { number: 3002, title: "feat: second half", state: "closed", merged_at: "2026-08-21T10:00:00Z", merged: true },
  3003: { number: 3003, title: "fix: landed", state: "closed", merged_at: "2026-08-22T10:00:00Z", merged: true },
  3007: { number: 3007, title: "fix(otp): first attempt", state: "closed", merged_at: null, merged: false, body: "" },
  3010: { number: 3010, title: "feat: still cooking", state: "open", merged_at: null, merged: false },
  3011: { number: 3011, title: "feat: merged sibling", state: "closed", merged_at: "2026-08-25T10:00:00Z", merged: true },
  3012: { number: 3012, title: "feat: superseded attempt", state: "closed", merged_at: null, merged: false, body: "Superseded by #3011." },
  3020: { number: 3020, title: "chore: closed quietly", state: "closed", merged_at: null, merged: false, body: "no reason given" },
};

/** GitHub issue comments per PR number (only consulted for closed-unmerged PRs). */
const PR_COMMENTS = {
  3007: [{ body: "CI was red for a week." }, { body: "Closing — superseded by #3009, which carries the three-layer fix." }],
  3020: [],
};

const DOD_TICKED = [
  "# 1 · Goal",
  "Ship it.",
  "",
  "# 5 · Definition of Done",
  "",
  "- [x] tests green",
  "- [X] docs updated",
  "",
  "# 6 · Branch",
  "`feature/meh-1-x`",
].join("\n");

/** The shape this repo's Linear cards actually use: `# 5 · Definition of Done` + `* ` bullets. */
const DOD_CARD_SHAPED = [
  "# 4 · Prompt ל-Claude Code",
  "",
  "* not a DoD line — a bullet under a different heading",
  "",
  "# 5 · Definition of Done",
  "",
  "* PR שגופו בלי `Closes MEH-N` → check אדום; self-test 6/6.",
  "* [x] כלל \"chunk = sub-issue\" ב-`workflow.md` + תבנית 06 מעודכנת.",
  "* `--dry-run` מסווג נכון את חמשת הכרטיסים מ-§2; אפס כתיבה בלי `write`.",
  "* CHANGELOG + HANDOFF עודכנו · build ירוק.",
  "",
  "# 6 · Branch",
  "",
  "* `feature/meh-2244-x` — also not a DoD line",
].join("\n");

/**
 * Linear issues. `expect` is the action the sweep must assign (or "filtered"
 * for an issue that must produce no row at all). It is fixture data, never
 * read by the module under test.
 */
const ISSUES = [
  {
    id: "id-a-ticked",
    identifier: "MEH-9001",
    title: "(a) all merged, DoD ticked",
    description: DOD_TICKED,
    state: { id: "s-todo", name: "Todo", type: "unstarted" },
    attachments: { nodes: [{ url: pull(3001), title: "first" }, { url: pull(3002), title: "second" }] },
    expect: "done",
  },
  {
    id: "id-a-unticked",
    identifier: "MEH-9002",
    title: "(a) all merged, card-shaped DoD unticked",
    description: DOD_CARD_SHAPED,
    state: { id: "s-prog", name: "In Progress", type: "started" },
    attachments: { nodes: [{ url: pull(3003), title: "landed" }] },
    expect: "dod-unticked",
  },
  {
    id: "id-b",
    identifier: "MEH-9003",
    title: "(b) only closed-unmerged",
    description: DOD_TICKED,
    state: { id: "s-backlog", name: "Backlog", type: "backlog" },
    attachments: { nodes: [{ url: pull(3007), title: "first attempt" }, { url: pull(3020), title: "quiet" }] },
    expect: "superseded",
  },
  {
    id: "id-c",
    identifier: "MEH-9004",
    title: "(c) one merged + one open",
    description: DOD_TICKED,
    state: { id: "s-prog", name: "In Progress", type: "started" },
    attachments: { nodes: [{ url: pull(3003), title: "landed" }, { url: pull(3010), title: "cooking" }] },
    expect: "skip",
  },
  {
    id: "id-none",
    identifier: "MEH-9005",
    title: "no PR attachments (issue link, fork PR, Figma)",
    description: DOD_TICKED,
    state: { id: "s-todo", name: "Todo", type: "unstarted" },
    attachments: {
      nodes: [
        { url: `https://github.com/${REPO}/issues/12`, title: "an issue" },
        { url: "https://github.com/someone-else/FoodMamkor/pull/3001", title: "fork PR" },
        { url: "https://www.figma.com/file/abc", title: "design" },
      ],
    },
    expect: "filtered",
  },
  {
    id: "id-a-mixed",
    identifier: "MEH-9006",
    title: "(a) merged beside a superseded attempt, DoD ticked",
    description: DOD_TICKED,
    state: { id: "s-todo", name: "Todo", type: "unstarted" },
    attachments: { nodes: [{ url: pull(3012), title: "attempt" }, { url: `${pull(3011)}#issuecomment-1`, title: "sibling" }] },
    expect: "done",
  },
  {
    id: "id-a-nodod",
    identifier: "MEH-9007",
    title: "(a) all merged, description has no DoD at all",
    description: "# 1 · Goal\n\nJust prose, no checklist.",
    state: { id: "s-todo", name: "Todo", type: "unstarted" },
    attachments: { nodes: [{ url: pull(3001), title: "first" }] },
    expect: "dod-unticked",
  },
];

const EXPECTED_ROWS = ISSUES.filter((i) => i.expect !== "filtered");
const EXPECTED_ACTIONABLE = EXPECTED_ROWS.filter((i) => ACTIONABLE.has(i.expect));
const EXPECTED_DONE = EXPECTED_ROWS.filter((i) => i.expect === "done");

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeFakes({ issues = ISSUES, existingComments = {}, pageSize = 100 } = {}) {
  const calls = { query: [], comment: [], setState: [], githubGet: [] };
  // Strip the test-only `expect` key so the module never sees it.
  const nodes = issues.map(({ expect: _e, ...rest }) => rest);
  const linear = {
    async query(gql, vars) {
      calls.query.push({ gql, vars });
      if (gql === GQL_ISSUES) {
        const start = vars.after ? Number(vars.after) : 0;
        const page = nodes.slice(start, start + pageSize);
        const end = start + page.length;
        return { issues: { pageInfo: { hasNextPage: end < nodes.length, endCursor: String(end) }, nodes: page } };
      }
      if (gql === GQL_COMMENTS) {
        return { issue: { comments: { nodes: (existingComments[vars.id] || []).map((body) => ({ body })) } } };
      }
      if (gql === GQL_DONE_STATE) {
        return { workflowStates: { nodes: [{ id: "state-canceled-ish", name: "Closed" }, { id: "state-done", name: "Done" }] } };
      }
      throw new Error(`fake linear: unexpected query ${gql.slice(0, 40)}`);
    },
    async comment(issueId, body) {
      calls.comment.push({ issueId, body });
    },
    async setState(issueId, stateId) {
      calls.setState.push({ issueId, stateId });
    },
  };
  const github = {
    async get(path) {
      calls.githubGet.push(path);
      let m = /^\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/.exec(path);
      if (m) {
        assert.equal(m[1], REPO, "PR fetched from the configured repo");
        const pr = PRS[m[2]];
        if (!pr) throw new Error(`fake github: HTTP 404 for ${path}`);
        return pr;
      }
      m = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/comments\?per_page=100$/.exec(path);
      if (m) return PR_COMMENTS[m[2]] || [];
      throw new Error(`fake github: unexpected path ${path}`);
    },
  };
  return { linear, github, calls };
}

// ---------------------------------------------------------------------------
// Unit: PR classes
// ---------------------------------------------------------------------------

test("classifyPr: merged / closed-unmerged / open", () => {
  assert.equal(classifyPr(PRS[3001]), "merged");
  assert.equal(classifyPr({ state: "closed", merged: true }), "merged", "merged flag alone counts");
  assert.equal(classifyPr(PRS[3007]), "closed-unmerged");
  assert.equal(classifyPr(PRS[3010]), "open");
  assert.throws(() => classifyPr(null), TypeError);
});

// ---------------------------------------------------------------------------
// Unit: attachments -> PR refs
// ---------------------------------------------------------------------------

test("extractPrRefs: only pull URLs on this repo, deduped, sorted, anchors tolerated", () => {
  const refs = extractPrRefs(
    [
      { url: `${pull(3002)}/files`, title: "files view" },
      { url: pull(3001), title: "one" },
      { url: pull(3001), title: "one again" },
      { url: `https://github.com/${REPO}/issues/3001`, title: "issue, not PR" },
      { url: "https://github.com/other/FoodMamkor/pull/7", title: "fork" },
      { url: "https://github.com/levismadar80-ship-it/FoodMamkorX/pull/8", title: "prefix-collision repo" },
      { url: "" },
      null,
    ],
    REPO,
  );
  assert.deepEqual(
    refs.map((r) => r.number),
    [3001, 3002],
  );
  assert.equal(refs[0].title, "one", "first occurrence wins on dedupe");
  assert.deepEqual(extractPrRefs(ISSUES.find((i) => i.id === "id-none").attachments.nodes, REPO), []);
});

// ---------------------------------------------------------------------------
// Unit: DoD parsing
// ---------------------------------------------------------------------------

test("parseDod: checkbox form anywhere in the description", () => {
  const dod = parseDod(DOD_TICKED);
  assert.equal(dod.lines.length, 2);
  assert.equal(dod.unticked.length, 0);
  const half = parseDod("- [ ] a\n- [x] b\n* [ ] c");
  assert.equal(half.lines.length, 3);
  assert.deepEqual(
    half.unticked.map((l) => l.text),
    ["a", "c"],
  );
});

test("parseDod: this repo's card shape — `# 5 · Definition of Done` + `* ` bullets", () => {
  const dod = parseDod(DOD_CARD_SHAPED);
  // Four bullets under the DoD heading; bullets under §4 and §6 are not DoD lines.
  const bulletsUnderDod = DOD_CARD_SHAPED.split("# 5 · Definition of Done")[1]
    .split("# 6 · Branch")[0]
    .split("\n")
    .filter((l) => l.startsWith("* "));
  assert.equal(dod.lines.length, bulletsUnderDod.length);
  assert.equal(dod.ticked.length, bulletsUnderDod.filter((l) => l.startsWith("* [x]")).length);
  assert.equal(dod.unticked.length, bulletsUnderDod.length - dod.ticked.length);
  assert.ok(dod.unticked.every((l) => !l.text.includes("not a DoD line")), "bullets outside the DoD section are excluded");
  assert.equal(dod.ticked[0].text.startsWith("כלל"), true, "`* [x]` under the DoD heading is ticked");
});

test("parseDod: no DoD at all -> zero lines (and classifyIssue refuses to call that ticked)", () => {
  const dod = parseDod("# 1 · Goal\n\nProse only.\n\n# 5 · Definition of Done\n\nNo bullets here.");
  assert.equal(dod.lines.length, 0);
  const prs = [{ number: 1, cls: "merged" }];
  assert.equal(classifyIssue({ description: "" }, prs).action, "dod-unticked");
  assert.equal(classifyIssue({ description: null }, prs).action, "dod-unticked");
});

// ---------------------------------------------------------------------------
// Unit: issue classes
// ---------------------------------------------------------------------------

test("classifyIssue: (a) ticked -> done · (a) unticked -> dod-unticked · (b) -> superseded · (c) -> skip · none -> filtered", () => {
  const merged = { cls: "merged" };
  const closed = { cls: "closed-unmerged" };
  const open = { cls: "open" };
  assert.deepEqual(
    pick(classifyIssue({ description: DOD_TICKED }, [merged, merged])),
    { cls: "a", action: "done" },
  );
  assert.deepEqual(
    pick(classifyIssue({ description: DOD_CARD_SHAPED }, [merged])),
    { cls: "a", action: "dod-unticked" },
  );
  assert.deepEqual(pick(classifyIssue({ description: DOD_TICKED }, [merged, closed])), { cls: "a", action: "done" }, "mixed merged+closed is (a)");
  assert.deepEqual(pick(classifyIssue({ description: DOD_TICKED }, [closed, closed])), { cls: "b", action: "superseded" });
  assert.deepEqual(pick(classifyIssue({ description: DOD_TICKED }, [merged, open])), { cls: "c", action: "skip" });
  assert.deepEqual(pick(classifyIssue({ description: DOD_TICKED }, [closed, open])), { cls: "c", action: "skip" });
  assert.deepEqual(pick(classifyIssue({ description: DOD_TICKED }, [])), { cls: "none", action: "filtered" });
  assert.throws(() => classifyIssue({}, [{ cls: "bogus" }]), /unknown PR class/);
});

function pick({ cls, action }) {
  return { cls, action };
}

// ---------------------------------------------------------------------------
// Unit: superseded reason, comment body, duplicate detection, table, args
// ---------------------------------------------------------------------------

test("supersededReason: title + first superseded/abandoned line from body or comments, else 'closed without merge'", () => {
  assert.equal(supersededReason(PRS[3012], []), "feat: superseded attempt — Superseded by #3011.");
  assert.equal(
    supersededReason(PRS[3007], PR_COMMENTS[3007]),
    "fix(otp): first attempt — Closing — superseded by #3009, which carries the three-layer fix.",
  );
  assert.equal(supersededReason(PRS[3020], PR_COMMENTS[3020]), "chore: closed quietly — closed without merge");
  assert.equal(supersededReason({ title: "" }, []), "closed without merge");
});

test("buildComment: marker first line, action-specific body, null for non-actionable rows", () => {
  const prs = [{ number: 3001, cls: "merged", title: "a | b" }];
  const done = buildComment({ action: "done", prs, dod: { unticked: [] } });
  assert.ok(done.startsWith(MARKER_PREFIX), "marker is the first line");
  assert.match(done.split("\n")[0], /^<!-- [a-z-]+:[0-9a-f]{64} -->$/);
  assert.match(done, /moving to Done/);
  assert.match(done, /a \\\| b/, "pipe in a title is escaped inside the table");

  const unticked = buildComment({ action: "dod-unticked", prs, dod: { unticked: [{ text: "docs updated" }, { text: "build green" }] } });
  assert.match(unticked, /all PRs merged, DoD unticked:/);
  assert.equal((unticked.match(/^- \[ \] /gm) || []).length, 2, "one line per unticked DoD item");

  const noDod = buildComment({ action: "dod-unticked", prs, dod: { unticked: [] } });
  assert.match(noDod, /no DoD lines found/);

  const sup = buildComment({ action: "superseded", prs: [{ number: 3007, cls: "closed-unmerged", reason: "x — superseded by #3009" }] });
  assert.match(sup, /superseded\/abandoned:\n\n- #3007 \(x — superseded by #3009\)/);

  assert.equal(buildComment({ action: "skip", prs }), null);
  assert.equal(buildComment(null), null);

  assert.notEqual(done.split("\n")[0], unticked.split("\n")[0], "different bodies get different markers");
  assert.equal(done, buildComment({ action: "done", prs, dod: { unticked: [] } }), "same input -> byte-identical comment");
});

test("isDuplicate: verbatim body, marker-only match, CRLF/whitespace tolerant, no false positive", () => {
  const body = buildComment({ action: "done", prs: [{ number: 1, cls: "merged", title: "t" }] });
  const marker = body.split("\n")[0];
  assert.equal(isDuplicate([{ body: "unrelated" }, { body }], body), true);
  assert.equal(isDuplicate([`${body.replaceAll("\n", "\r\n")}\n`], body), true, "CRLF + trailing newline still identical");
  assert.equal(isDuplicate([{ body: `${marker}\nsomeone edited the rest` }], body), true, "marker alone is enough");
  assert.equal(isDuplicate([{ body: "unrelated" }, { body: null }, ""], body), false);
  assert.equal(isDuplicate([], body), false);
  assert.equal(isDuplicate(["plain"], "plain"), true, "works for marker-less bodies too");
});

test("renderTable: four columns in dry-run, five in write, empty-state row", () => {
  const rows = [
    { identifier: "MEH-1", prs: [{ number: 5, cls: "merged" }, { number: 6, cls: "closed-unmerged" }], cls: "a", action: "done", result: "done" },
  ];
  const dry = renderTable(rows);
  assert.equal(dry.split("\n")[0], "| issue | PRs | class | action |");
  assert.equal(dry.split("\n")[2], "| MEH-1 | #5 (merged), #6 (closed-unmerged) | a | done |");
  const write = renderTable(rows, { write: true });
  assert.equal(write.split("\n")[0], "| issue | PRs | class | action | result |");
  assert.match(write.split("\n")[2], /\| done \| done \|$/);
  assert.match(renderTable([]), /no issues with PR attachments/);
});

test("parseArgs: defaults, repeatable --issue, --write flips dryRun, unknown flag throws", () => {
  const d = parseArgs([]);
  assert.deepEqual([d.write, d.dryRun, d.json, d.team, d.repo, d.issues], [false, true, false, "Mehamakor", REPO, null]);
  const w = parseArgs(["--write", "--json", "--issue", "meh-1754", "--issue=MEH-2122", "--team", "T", "--repo=o/r"]);
  assert.deepEqual([w.write, w.dryRun, w.json, w.team, w.repo, [...w.issues]], [true, false, true, "T", "o/r", ["MEH-1754", "MEH-2122"]]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown flag/);
  assert.throws(() => parseArgs(["--issue"]), /needs a value/);
  assert.throws(() => parseArgs(["--issue", "--write"]), /needs a value/);
});

// ---------------------------------------------------------------------------
// Integration: run() with fakes
// ---------------------------------------------------------------------------

test("run --dry-run: every fixture gets its expected action, filtered issues produce no row, zero mutations", async () => {
  const { linear, github, calls } = makeFakes();
  const out = [];
  const { rows, table } = await run({ linear, github, argv: ["--dry-run"], stdout: (s) => out.push(s) });

  assert.equal(rows.length, EXPECTED_ROWS.length, "one row per issue with PR attachments");
  for (const fixture of EXPECTED_ROWS) {
    const row = rows.find((r) => r.identifier === fixture.identifier);
    assert.ok(row, `${fixture.identifier} has a row`);
    assert.equal(row.action, fixture.expect, `${fixture.identifier}: ${fixture.title}`);
  }
  for (const fixture of ISSUES.filter((i) => i.expect === "filtered")) {
    assert.equal(rows.some((r) => r.identifier === fixture.identifier), false, `${fixture.identifier} filtered out`);
  }

  // Classes agree with actions.
  const clsFor = { done: "a", "dod-unticked": "a", superseded: "b", skip: "c" };
  for (const r of rows) assert.equal(r.cls, clsFor[r.action], `${r.identifier} class`);

  // Superseded rows carry a reason per PR, read from the PR body / comments.
  const b = rows.find((r) => r.identifier === "MEH-9003");
  assert.equal(b.prs.find((p) => p.number === 3007).reason, supersededReason(PRS[3007], PR_COMMENTS[3007]));
  assert.equal(b.prs.find((p) => p.number === 3020).reason, "chore: closed quietly — closed without merge");

  // The unticked lines are the card-shaped bullets, surfaced verbatim.
  const a2 = rows.find((r) => r.identifier === "MEH-9002");
  assert.equal(a2.dod.unticked.length, 3);
  assert.equal(a2.dod.ticked.length, 1);

  // Dry-run: no comment fetches, no comments, no state moves.
  assert.equal(calls.comment.length, 0, "dry-run posts no comment");
  assert.equal(calls.setState.length, 0, "dry-run moves no issue");
  assert.equal(calls.query.filter((q) => q.gql !== GQL_ISSUES).length, 0, "dry-run issues only the issues query");

  // Table shape + stdout.
  assert.equal(table.split("\n")[0], "| issue | PRs | class | action |");
  assert.equal(table.split("\n").length, 2 + rows.length);
  assert.ok(out.join("\n").includes(table));
  assert.match(out[0], /DRY-RUN \(no Linear writes\)/);

  // PR fetches are cached per number across issues.
  const prFetches = calls.githubGet.filter((p) => /\/pulls\/\d+$/.test(p));
  const distinct = new Set(prFetches);
  assert.equal(prFetches.length, distinct.size, "each PR fetched once");
  const referenced = new Set(EXPECTED_ROWS.flatMap((i) => extractPrRefs(i.attachments.nodes, REPO).map((r) => r.number)));
  assert.equal(distinct.size, referenced.size);
});

test("run --dry-run --json: JSON block on stdout mirrors the rows", async () => {
  const { linear, github } = makeFakes();
  const out = [];
  const { rows, json } = await run({ linear, github, argv: ["--json"], stdout: (s) => out.push(s) });
  assert.ok(json, "json emitted");
  const parsed = JSON.parse(json);
  assert.equal(parsed.mode, "dry-run");
  assert.deepEqual(
    parsed.rows.map((r) => [r.identifier, r.action]),
    rows.map((r) => [r.identifier, r.action]),
  );
  assert.equal(out.at(-1), json, "JSON is the last thing on stdout");
});

test("run --issue: filters to the named identifiers (case-insensitive)", async () => {
  const { linear, github } = makeFakes();
  const { rows } = await run({ linear, github, argv: ["--issue", "meh-9003", "--issue", "MEH-9005"], stdout: () => {} });
  assert.deepEqual(
    rows.map((r) => r.identifier),
    ["MEH-9003"],
    "MEH-9005 has no PR attachments, so the filter yields one row",
  );
});

test("run: Linear pagination is followed to the end", async () => {
  const { linear, github, calls } = makeFakes({ pageSize: 2 });
  const { rows } = await run({ linear, github, argv: [], stdout: () => {} });
  const pages = calls.query.filter((q) => q.gql === GQL_ISSUES).length;
  assert.equal(pages, Math.ceil(ISSUES.length / 2));
  assert.equal(rows.length, EXPECTED_ROWS.length);
});

test("run --write: exactly one comment per actionable row, one state move per `done` row, skip only in the table", async () => {
  const { linear, github, calls } = makeFakes();
  const { rows, table } = await run({ linear, github, argv: ["--write"], stdout: () => {} });

  assert.equal(calls.comment.length, EXPECTED_ACTIONABLE.length, "one comment per actionable fixture");
  assert.deepEqual(
    calls.comment.map((c) => c.issueId).sort(),
    EXPECTED_ACTIONABLE.map((i) => i.id).sort(),
  );
  for (const c of calls.comment) {
    assert.ok(c.body.startsWith(MARKER_PREFIX), "every posted comment starts with the marker");
    const row = rows.find((r) => r.id === c.issueId);
    assert.equal(c.body, buildComment(row), "posted body is buildComment(row)");
  }

  assert.equal(calls.setState.length, EXPECTED_DONE.length, "one move per done fixture");
  assert.deepEqual(
    calls.setState.map((s) => s.issueId).sort(),
    EXPECTED_DONE.map((i) => i.id).sort(),
  );
  assert.ok(calls.setState.every((s) => s.stateId === "state-done"), "moved to the state named Done, not the first completed state");

  for (const r of rows) {
    assert.equal(r.result, ACTIONABLE.has(r.action) ? "done" : "n/a", `${r.identifier} result`);
    assert.equal(Boolean(r.moved), r.action === "done", `${r.identifier} moved flag`);
  }
  assert.equal(table.split("\n")[0], "| issue | PRs | class | action | result |");
});

test("run --write: an identical existing comment (verbatim or by marker) is skipped, and nothing else changes", async () => {
  // First pass produces the bodies; second pass sees them as existing.
  const first = makeFakes();
  await run({ linear: first.linear, github: first.github, argv: ["--write"], stdout: () => {} });
  const posted = Object.fromEntries(first.calls.comment.map((c) => [c.issueId, c.body]));

  const verbatimId = EXPECTED_ACTIONABLE[0].id;
  const markerOnlyId = EXPECTED_ACTIONABLE[1].id;
  const existingComments = {
    [verbatimId]: ["an unrelated human comment", posted[verbatimId]],
    [markerOnlyId]: [`${posted[markerOnlyId].split("\n")[0]}\nhand-edited remainder`],
  };
  const second = makeFakes({ existingComments });
  const { rows } = await run({ linear: second.linear, github: second.github, argv: ["--write"], stdout: () => {} });

  const skipped = rows.filter((r) => r.result === "skipped-identical").map((r) => r.id).sort();
  assert.deepEqual(skipped, [verbatimId, markerOnlyId].sort());
  assert.equal(second.calls.comment.length, EXPECTED_ACTIONABLE.length - 2, "the two identical rows are not re-posted");
  assert.equal(second.calls.comment.some((c) => c.issueId === verbatimId || c.issueId === markerOnlyId), false);
  assert.equal(second.calls.setState.length, EXPECTED_DONE.length, "a `done` row still moves even when its comment already exists");
});

test("run: refuses to start without both clients", async () => {
  await assert.rejects(() => run({ linear: null, github: {} }), /clients are required/);
  await assert.rejects(() => run({}), /clients are required/);
});
