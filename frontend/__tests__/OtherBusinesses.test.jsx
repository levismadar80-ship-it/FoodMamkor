import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-2592: the similar / nearby rows moved out of ProducerSections into one
// band at the page end. These are the gates they carried there (MEH-102: ≥ 3
// similar; MEH-1146 chunk C: ≥ 4 nearby), now on the band, plus the band's own
// rule: no row → no band.

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/components/ProducerCard", () => ({
  default: ({ producer, referrer }) => <div data-testid={`card-${referrer}`}>{producer.id}</div>,
}));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children, as: _as, ...rest }) => <section {...rest}>{children}</section>,
  REVEAL_PRESET: {},
}));

import OtherBusinesses from "@/app/[locale]/producer/[id]/components/OtherBusinesses";

const list = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));
const producer = { id: 1, categories: [{ id: 1, name: "ירקות" }] };

describe("OtherBusinesses (MEH-2592)", () => {
  it("0 rows: renders no band at all", () => {
    const { container } = render(
      <OtherBusinesses producer={producer} similarProducers={list("s", 2)} nearbyProducers={list("n", 3)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("1 row (nearby only, at the minimum of 4): band with that row only", () => {
    render(<OtherBusinesses producer={producer} similarProducers={[]} nearbyProducers={list("n", 4)} />);
    expect(screen.getByTestId("other-businesses")).toBeInTheDocument();
    expect(screen.getByText("producer.detail.sections.nearby.heading")).toBeInTheDocument();
    expect(screen.queryByText("producer.detail.sections.similar.heading")).toBeNull();
    expect(screen.getAllByTestId("card-nearby")).toHaveLength(4);
  });

  it("1 row (similar only, at the minimum of 3): band with that row only", () => {
    render(<OtherBusinesses producer={producer} similarProducers={list("s", 3)} nearbyProducers={[]} />);
    expect(screen.getByText("producer.detail.sections.similar.heading")).toBeInTheDocument();
    expect(screen.queryByText("producer.detail.sections.nearby.heading")).toBeNull();
    expect(screen.getAllByTestId("card-similar")).toHaveLength(3);
  });

  it("2 rows: similar first, then nearby (capped at 6), inside one band", () => {
    render(<OtherBusinesses producer={producer} similarProducers={list("s", 3)} nearbyProducers={list("n", 9)} />);
    const band = screen.getByTestId("other-businesses");
    const similar = screen.getByText("producer.detail.sections.similar.heading");
    const nearby = screen.getByText("producer.detail.sections.nearby.heading");
    expect(band).toContainElement(similar);
    expect(band).toContainElement(nearby);
    expect(similar.compareDocumentPosition(nearby) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId("card-nearby")).toHaveLength(6);
  });
});
