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
  // `\(\w*\)` and not `\(\)`: the catch may name its error param. The first
  // version of this regex matched only `() =>`, so `.catch((err) => setX([]))`
  // walked straight past a guard whose docstring promised to catch "a NEW
  // fail-open added later" — the assertion claimed more coverage than it had.
  // Caught by the CI reviewer on this PR; the control below now pins both forms.
  const FAIL_OPEN =
    /\.catch\(\(\w*\)\s*=>\s*set[A-Za-z]+\(\[\]\)\)|\.catch\(\(\w*\)\s*=>\s*set[A-Za-z]+\(null\)\)|\.catch\(\(\w*\)\s*=>\s*\[\]\)|\.catch\(\(\w*\)\s*=>\s*null\)/;

  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
    }
  })(ADMIN);

  it("CONTROL — the scanner matches a known fail-open string", () => {
    // Without this, an empty result below could mean "the tree is clean" OR
    // "the regex matches nothing at all". Run it first.
    expect(FAIL_OPEN.test(".catch(() => setUsers([]))")).toBe(true);
    expect(FAIL_OPEN.test(".catch(() => setProducer(null))")).toBe(true);
    expect(FAIL_OPEN.test(".catch(() => [])")).toBe(true);
    // The named-error-param form is the same defect wearing a different shape,
    // and it is the one the first version of this regex let through.
    expect(FAIL_OPEN.test(".catch((err) => setReports([]))")).toBe(true);
    expect(FAIL_OPEN.test(".catch((e) => setProducer(null))")).toBe(true);
    expect(FAIL_OPEN.test(".catch((error) => [])")).toBe(true);
    // ...and does not fire on the shape that replaced them.
    expect(FAIL_OPEN.test(".catch(() => setLoadError(true))")).toBe(false);
    expect(files.length).toBeGreaterThan(10);
  });

  it("no admin file swallows a load failure into an empty result", () => {
    const hits = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (FAIL_OPEN.test(line)) hits.push(`${path.relative(ADMIN, f)}:${i + 1}`);
      });
    }
    expect(hits, `fail-open catches still present:\n${hits.join("\n")}`).toEqual([]);
  });
});
