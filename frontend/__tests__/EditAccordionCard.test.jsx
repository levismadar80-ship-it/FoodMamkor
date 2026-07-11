import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import EditAccordionCard from "@/components/EditAccordionCard";

// MEH-1116: accordion shell — header aria wiring, hidden-toggle (children stay
// MOUNTED on collapse so card state + the MEH-1100 guard survive), summary line.

vi.mock("@phosphor-icons/react", () => ({
  CaretDown: (props) => <span data-testid="icon-caret" {...props} />,
}));

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <EditAccordionCard
      anchorId="contact-channels"
      title="ערוצי קשר"
      summary="טלפון ✓ · וואטסאפ ראשי"
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <input data-testid="inner-input" defaultValue="" />
    </EditAccordionCard>
  );
}

describe("EditAccordionCard (MEH-1116)", () => {
  it("collapsed: header shows title + summary, panel hidden, child still mounted", () => {
    render(<Host />);
    const btn = screen.getByTestId("accordion-contact-channels");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveTextContent("ערוצי קשר");
    expect(btn).toHaveTextContent("טלפון ✓ · וואטסאפ ראשי");
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    expect(panel).toHaveAttribute("hidden");
    // The hard MEH-1100 constraint: collapse must NOT unmount the card.
    expect(screen.getByTestId("inner-input")).toBeInTheDocument();
  });

  it("anchor id is on the section element (deep-link contract)", () => {
    render(<Host />);
    expect(document.getElementById("contact-channels")?.tagName).toBe("SECTION");
  });

  it("toggle opens the panel and preserves typed child state across collapse/reopen", () => {
    render(<Host />);
    const btn = screen.getByTestId("accordion-contact-channels");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    expect(panel).not.toHaveAttribute("hidden");
    // type while open → collapse → reopen → value survives
    fireEvent.change(screen.getByTestId("inner-input"), {
      target: { value: "050-1234567" },
    });
    fireEvent.click(btn); // collapse
    expect(panel).toHaveAttribute("hidden");
    fireEvent.click(btn); // reopen
    expect(screen.getByTestId("inner-input")).toHaveValue("050-1234567");
  });
});
