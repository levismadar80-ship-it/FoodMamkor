import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Pagination from "@/components/Pagination";

describe("Pagination", () => {
  it("renders prev + next + numbered buttons", () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={10} onChange={onChange} />);
    expect(screen.getByLabelText("עמוד קודם")).toBeInTheDocument();
    expect(screen.getByLabelText("עמוד הבא")).toBeInTheDocument();
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
    expect(screen.getByLabelText("עמוד קודם")).toBeDisabled();
    expect(screen.getByLabelText("עמוד הבא")).not.toBeDisabled();

    rerender(<Pagination page={10} totalPages={10} onChange={() => {}} />);
    expect(screen.getByLabelText("עמוד קודם")).not.toBeDisabled();
    expect(screen.getByLabelText("עמוד הבא")).toBeDisabled();
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
    fireEvent.click(screen.getByLabelText("עמוד קודם"));
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByLabelText("עמוד הבא"));
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
});
