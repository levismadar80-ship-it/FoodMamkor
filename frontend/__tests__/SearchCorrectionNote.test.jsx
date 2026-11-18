import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import SearchCorrectionNote from "@/components/SearchCorrectionNote";

// MEH-3415 — rendered with the REAL next-intl and he.json, so a tag the
// message uses (<strong>, <bdi>) without a handler in the component fails
// here instead of passing a regex-stripping mock.
function renderNote(props) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={(e) => { throw e; }}>
      <SearchCorrectionNote onSearchAsTyped={vi.fn()} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("SearchCorrectionNote (real next-intl)", () => {
  it("renders the three approved lines with the word bold and the Latin isolated", () => {
    const { container } = renderNote({ corrected: "דבש", original: "sca" });
    const note = screen.getByTestId("hero-search-correction");
    expect(note.textContent).toContain("מציגים תוצאות עבור דבש");
    expect(note.textContent).toContain("הקלדתם sca — אולי המקלדת הייתה באנגלית.");
    expect(screen.getByRole("button").textContent).toBe("לחפש בכל זאת «sca»");
    expect(container.querySelector("strong bdi").textContent).toBe("דבש");
    expect(container.querySelectorAll("bdi").length).toBe(3);
    expect(note.getAttribute("aria-live")).toBe("polite");
  });

  it("keeps focus in the search field: mousedown on the button is prevented", () => {
    renderNote({ corrected: "דבש", original: "sca" });
    const button = screen.getByRole("button");
    const down = createEvent.mouseDown(button);
    fireEvent(button, down);
    expect(down.defaultPrevented).toBe(true);
  });
});
