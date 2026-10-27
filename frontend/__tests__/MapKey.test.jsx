/**
 * MEH-2424 — "מה רואים במפה?": the map's marker key, on every viewport.
 *
 * The map draws seven kinds of marks and, on a phone, explained none of them
 * (the desktop legend lists categories only). The key is a ? control in the
 * map's own control column that opens a panel with one row per mark, each row
 * drawn with the same visual the map uses. Rendered with the REAL he.json so
 * the assertions read the approved copy, not key names.
 *
 * Cells (CLAUDE.md § conditional-UI states): closed → open → closed by each of
 * the three exits (the toggle again, the ✕, Escape).
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import MapKey from "@/app/[locale]/map/components/MapKey";

const K = he.map.pane.key;

function renderKey() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <MapKey />
    </NextIntlClientProvider>,
  );
}

const toggle = () => screen.getByRole("button", { name: K.title });

describe("map key (MEH-2424)", () => {
  it("starts closed: the ? control is there, the panel is not", () => {
    renderKey();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("map-key-panel")).toBeNull();
  });

  it("opens a panel titled with the question, one row per mark, in order", () => {
    renderKey();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByTestId("map-key-panel");
    expect(within(panel).getByRole("heading", { name: K.title })).toBeInTheDocument();
    const rows = within(panel).getAllByTestId("map-key-row");
    expect(rows.map((r) => r.textContent)).toEqual([
      K.photo,
      K.verified,
      K.cluster,
      K.pickup,
      K.approximate,
      he.map.pane.pickup_layer.aria,
    ]);
  });

  it.each([
    ["the toggle again", () => fireEvent.click(toggle())],
    ["the ✕", () => fireEvent.click(screen.getByRole("button", { name: he.common.aria.close }))],
    ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
  ])("closes with %s", (_label, close) => {
    renderKey();
    fireEvent.click(toggle());
    expect(screen.getByTestId("map-key-panel")).toBeInTheDocument();
    close();
    expect(screen.queryByTestId("map-key-panel")).toBeNull();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });
});
