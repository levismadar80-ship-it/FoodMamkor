/**
 * MEH-2096 — an admin load failure must not render as an empty result.
 *
 * Eight admin fetches swallowed their error into the ordinary empty state, so a
 * dead API and a genuinely empty list produced the SAME screen. The pending-
 * producers queue is the case that matters: manual approval of every business is
 * a locked product invariant, so "no businesses awaiting approval" rendered
 * against a broken endpoint means real businesses wait and nobody can tell.
 *
 * Four branches per site, because three of them pass on the broken code too:
 *   success-with-data · success-empty · failure-shows-error · retry-succeeds
 * Only the third discriminates, and the fourth proves the recovery path is real
 * rather than a dead button.
 *
 * The last block is a structural absence assertion over the whole admin tree, so
 * a NEW fail-open added later fails here even though no test names that file.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key) => key,
}));

const get = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("status=pending"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import AdminLoadError from "@/components/admin/AdminLoadError";
import { useAdminProducers } from "@/app/[locale]/admin/producers/use-admin-producers";

beforeEach(() => vi.clearAllMocks());

describe("AdminLoadError (MEH-2096)", () => {
  it("announces itself as an alert and offers a retry", () => {
    const onRetry = vi.fn();
    render(<AdminLoadError onRetry={onRetry} testId="x-load-error" />);
    const card = screen.getByTestId("x-load-error");
    expect(card).toHaveAttribute("role", "alert");
    fireEvent.click(screen.getByTestId("x-load-error-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders no retry control when the caller supplies no handler", () => {
    // A button that cannot do anything is worse than no button.
    render(<AdminLoadError testId="y-load-error" />);
    expect(screen.queryByTestId("y-load-error-retry")).toBeNull();
  });
});

describe("pending-producers queue — the four branches (MEH-2096)", () => {
  const rows = [{ id: 1, producer_name: "מאפיית ספיר", status: "pending" }];

  it("success with data — rows land, no error", async () => {
    get.mockResolvedValue({ data: rows });
    const { result } = renderHook(() => useAdminProducers());
    await waitFor(() => expect(result.current.producers).toHaveLength(1));
    expect(result.current.loadError).toBe(false);
  });

  it("success but empty — an empty queue is NOT an error", async () => {
    get.mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useAdminProducers());
    await waitFor(() => expect(result.current.loadError).toBe(false));
    expect(result.current.producers).toEqual([]);
  });

  it("failure — sets loadError instead of an empty list", async () => {
    // THE discriminating branch. On the pre-MEH-2096 code the catch called
    // setProducers([]), so `producers` was [] and there was no error flag at
    // all — identical state to the empty-success case directly above.
    get.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useAdminProducers());
    await waitFor(() => expect(result.current.loadError).toBe(true));
  });

  it("retry after a failure clears the error and loads the rows", async () => {
    get.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useAdminProducers());
    await waitFor(() => expect(result.current.loadError).toBe(true));

    get.mockResolvedValue({ data: rows });
    await act(async () => { result.current.loadAllProducers(); });
    await waitFor(() => expect(result.current.loadError).toBe(false));
    expect(result.current.producers).toHaveLength(1);
  });
});

describe("no fail-open catch survives under admin/ (MEH-2096)", () => {
  const ADMIN = path.resolve(__dirname, "..", "app", "[locale]", "admin");

  /**
   * Extract the full argument text of every `.catch( … )`, by balancing
   * parentheses from the opening one.
   *
   * This deliberately does NOT enumerate arrow-function spellings. Two earlier
   * versions did, and each was defeated by a spelling it had not listed: first
   * a named error param, then a block body. The reviewer's second catch is the
   * useful signal — a regex over arrow syntax will always be one shape behind,
   * and the control cannot reveal the gap because it is written from the same
   * list of shapes. Reading the argument itself removes the class: `() =>`,
   * `(err) =>`, `async (e) => { … }`, multi-line bodies and future shapes all
   * arrive here as plain text.
   */
  function catchArgs(src) {
    const out = [];
    for (const m of src.matchAll(/\.catch\(/g)) {
      let depth = 0;
      const from = m.index + m[0].length - 1; // at the '('
      for (let i = from; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") {
          depth--;
          if (depth === 0) { out.push({ text: src.slice(from + 1, i), index: m.index }); break; }
        }
      }
    }
    return out;
  }

  /**
   * A catch is fail-open when it empties/nulls the result AND does not record
   * the failure anywhere.
   *
   * The second half is load-bearing and was missing at first: the stronger
   * scanner immediately flagged two catches that null state *deliberately*
   * while setting an error flag beside it — `admin/layout.js` (counts stay
   * null so no number is fabricated, `setCountsError(true)` carries the
   * distinction) and `producers/[id]/edit` (`setProducer(null)` only on a real
   * 404, `setLoadError(true)` otherwise). Nulling is not the defect. Nulling
   * **and staying silent** is.
   */
  const EMPTIES = /set[A-Za-z]+\(\s*(\[\]|null)\s*\)/;
  const RETURNS_EMPTY = /=>\s*(\[\]|null)\s*$/;
  // Deliberately NOT console.warn/error: a log is invisible to the admin, who
  // still sees an empty list. The control pins this — an earlier version of
  // this set counted console logging as "recorded" and the synthetic
  // `console.warn(err); setReviews([])` case immediately went green, which is
  // precisely the swallow this ticket exists to remove.
  const RECORDS_ERROR = /set[A-Za-z]*(Error|Failed)[A-Za-z]*\(|showToast\.error/;
  const isFailOpen = (arg) =>
    (EMPTIES.test(arg) || RETURNS_EMPTY.test(arg.trim())) && !RECORDS_ERROR.test(arg);

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
    }
  })(ADMIN);

  it("CONTROL — the scanner reads catch bodies, not one arrow spelling", () => {
    // Every shape below is the SAME defect. A guard that catches some of them
    // and not others reports clean on the ones it cannot see.
    for (const shape of [
      ".catch(() => setUsers([]))",
      ".catch((err) => setReports([]))",
      ".catch((e) => setProducer(null))",
      ".catch(() => [])",
      ".catch((error) => null)",
      ".catch((err) => { setUsers([]); })",
      ".catch(async (err) => { console.warn(err); setReviews([]); })",
      ".catch((err) => {\n  logIt(err);\n  setProducers([]);\n})",
    ]) {
      const args = catchArgs(shape);
      expect(args.length, `scanner found no catch in: ${shape}`).toBe(1);
      expect(isFailOpen(args[0].text), `missed a fail-open shape: ${shape}`).toBe(true);
    }

    // ...and must NOT fire on the shapes that replaced them, or on unrelated
    // catches that genuinely surface the failure.
    for (const ok of [
      ".catch(() => setLoadError(true))",
      ".catch(() => showToast.error(t('load_error')))",
      ".catch((err) => { setLoadError(true); })",
      // Both of these are REAL shapes lifted from this repo, not invented ones.
      // A predicate validated only on shapes I made up would have rejected them.
      ".catch(() => { setPendingModCount(null); setPendingKashrutCount(null); setCountsError(true); })",
      ".catch((err) => { if (err?.response?.status === 404) setProducer(null); else setLoadError(true); })",
    ]) {
      expect(isFailOpen(catchArgs(ok)[0].text), `false positive on: ${ok}`).toBe(false);
    }

    expect(files.length).toBeGreaterThan(10);
  });

  it("no admin file swallows a load failure into an empty result", () => {
    const hits = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const { text, index } of catchArgs(src)) {
        if (!isFailOpen(text)) continue;
        const line = src.slice(0, index).split("\n").length;
        hits.push(`${path.relative(ADMIN, f)}:${line}`);
      }
    }
    expect(hits, `fail-open catches still present:\n${hits.join("\n")}`).toEqual([]);
  });
});
