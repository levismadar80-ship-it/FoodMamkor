import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { useProducerData } from "@/app/[locale]/producer/[id]/hooks/useProducerData";

// MEH-1151: slug→slug navigation within the same [slug] route segment must
// show the destination business, not stay stuck on the previous one. The root
// cause lives in useProducerData: `useState(initialProducer)` seeds ONCE and
// its fetch effect short-circuits on `if (initialProducer) return`, so a bare
// prop change never updates state. The fix is `key={params.slug}` on
// <ProducerDetail> in [slug]/page.js, which forces a remount so the hook
// re-seeds. These two tests pin both halves: the seed-once behavior (why the
// key is required) and that a keyed remount re-seeds to the new business.
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));
vi.mock("@/lib/recently-viewed", () => ({ pushRecentlyViewed: vi.fn() }));

const A = { id: "aaaa", name: "מאפיית אורה", categories: [] };
const B = { id: "bbbb", name: "דבש הגליל", categories: [] };

// Minimal consumer of the shared hook — mirrors how ProducerDetail reads
// `producer` from useProducerData, without pulling in the heavy page tree.
function Probe({ slug, initialProducer }) {
  const { producer } = useProducerData({
    params: { slug },
    fetchPath: `/producers/by-slug/${slug}`,
    initialProducer,
  });
  return <div data-testid="name">{producer?.name}</div>;
}

describe("MEH-1151 — slug→slug producer-page remount", () => {
  it("bare prop change keeps stale state (documents the root cause)", () => {
    const { rerender } = render(<Probe slug="ora" initialProducer={A} />);
    expect(screen.getByTestId("name").textContent).toBe("מאפיית אורה");
    // Same instance, no key → useState(initialProducer) ignores the new prop
    // and the fetch guard skips: the page would stay on business A.
    rerender(<Probe slug="dvash" initialProducer={B} />);
    expect(screen.getByTestId("name").textContent).toBe("מאפיית אורה");
  });

  it("key={slug} remount re-seeds state to the new business (the fix)", () => {
    const { rerender } = render(<Probe key="ora" slug="ora" initialProducer={A} />);
    expect(screen.getByTestId("name").textContent).toBe("מאפיית אורה");
    // key change → React unmounts + remounts → useState re-seeds with B.
    rerender(<Probe key="dvash" slug="dvash" initialProducer={B} />);
    expect(screen.getByTestId("name").textContent).toBe("דבש הגליל");
  });
});
