import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-475 PR-C4a chunk 3: mock next-intl per PR-A1/B precedent.
// Pagination uses ICU interpolation for `page_aria`; the mock substitutes
// {page} so aria-label assertions like "עמוד 3" continue to match.
vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const flat = {
      aria_label: "עימוד",
      per_page_label: "הצגה לעמוד",
      per_page_aria: "פריטים לעמוד",
      prev: "← הקודם",
      page_aria: `עמוד ${vars?.page ?? ""}`.trim(),
      next: "הבא →",
    };
    return flat[key] ?? key;
  },
}));

import Pagination from "@/components/Pagination";

describe("Pagination", () => {
  it("renders prev + next + numbered buttons", () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={10} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "← הקודם" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הבא →" })).toBeInTheDocument();
    expect(screen.getByLabelText("עמוד 3")).toBeInTheDocument();
  });

  it("marks the active page with aria-current", () => {
    render(<Pagination page={5} totalPages={10} onChange={() => {}} />);
    const active = screen.getByLabelText("עמוד 5");
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("disables prev on page 1 and next on last page", () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={10} onChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "← הקודם" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "הבא →" })).not.toBeDisabled();

    rerender(<Pagination page={10} totalPages={10} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "← הקודם" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "הבא →" })).toBeDisabled();
  });

  it("calls onChange with the new page when a number is clicked", () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={10} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("עמוד 4"));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("does NOT call onChange when the currently-active page is clicked", () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={10} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("עמוד 3"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange(page-1) for prev and onChange(page+1) for next", () => {
    const onChange = vi.fn();
    render(<Pagination page={5} totalPages={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "← הקודם" }));
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "הבא →" }));
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it("hides the per-page selector unless both perPage and onPerPageChange are passed", () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={5} onChange={() => {}} />,
    );
    expect(screen.queryByLabelText("פריטים לעמוד")).not.toBeInTheDocument();

    rerender(
      <Pagination
        page={1}
        totalPages={5}
        onChange={() => {}}
        perPage={25}
        onPerPageChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("פריטים לעמוד")).toBeInTheDocument();
  });

  it("calls onPerPageChange with a Number when selector changes", () => {
    const onPerPageChange = vi.fn();
    render(
      <Pagination
        page={1}
        totalPages={5}
        onChange={() => {}}
        perPage={25}
        onPerPageChange={onPerPageChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("פריטים לעמוד"), {
      target: { value: "50" },
    });
    expect(onPerPageChange).toHaveBeenCalledWith(50);
    expect(typeof onPerPageChange.mock.calls[0][0]).toBe("number");
  });

  it("renders ellipsis markers for long ranges", () => {
    render(<Pagination page={10} totalPages={20} onChange={() => {}} />);
    const ellipses = document.querySelectorAll('span[aria-hidden="true"]');
    expect(ellipses.length).toBeGreaterThanOrEqual(2);
  });

  // MEH-3549 — WCAG 2.5.3 Label in Name. Rendered on a page that HAS a
  // previous page (3 of 10), so «הקודם» is shown and enabled — #4989 passed
  // locally only because no list there had a second page. The accessible
  // name must contain the visible text; the old aria-label «עמוד קודם» did
  // not contain «הקודם» and this assertion fails against it.
  it("prev/next accessible names contain their visible text (WCAG 2.5.3)", () => {
    render(<Pagination page={3} totalPages={10} onChange={() => {}} />);
    const nav = screen.getByTestId("pagination");
    const buttons = Array.from(nav.querySelectorAll("button"));
    const prev = buttons.find((b) => b.textContent === "← הקודם");
    const next = buttons.find((b) => b.textContent === "הבא →");
    expect(prev).toBeDefined();
    expect(next).toBeDefined();
    expect(prev).not.toBeDisabled();
    expect(prev).toHaveAccessibleName(expect.stringContaining("הקודם"));
    expect(next).toHaveAccessibleName(expect.stringContaining("הבא"));
  });
});
