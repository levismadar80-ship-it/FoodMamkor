/**
 * MEH-3611 — LogoCard: upload saves the logo at once, remove clears it, a
 * refused upload says why. Cells: no logo · a logo; upload · remove · error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { LogoCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const L = he.dashboard.producer.logo;

function renderCard(logo_url) {
  const onSave = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <LogoCard profile={{ logo_url }} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { url: "https://cdn/logo.png" } });
});

describe("LogoCard", () => {
  it("no logo → an upload button, no preview, no remove", () => {
    renderCard(null);
    expect(screen.getByText(L.cta)).toBeTruthy();
    expect(screen.queryByTestId("logo-preview")).toBeNull();
    expect(screen.queryByTestId("logo-remove")).toBeNull();
  });

  it("an upload is saved on the business at once", async () => {
    const { onSave } = renderCard(null);
    const file = new File(["x"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("logo-input"), { target: { files: [file] } });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ logo_url: "https://cdn/logo.png" }));
    expect(api.post).toHaveBeenCalledWith("/upload/image", expect.anything());
    expect(api.put).toHaveBeenCalledWith("/producers/me", { logo_url: "https://cdn/logo.png" });
    expect(screen.getByTestId("logo-preview").getAttribute("src")).toBe("https://cdn/logo.png");
    expect(screen.getByText(L.replace_cta)).toBeTruthy();
  });

  it("remove clears the logo", async () => {
    const { onSave } = renderCard("https://cdn/old.png");
    fireEvent.click(screen.getByTestId("logo-remove"));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ logo_url: null }));
    expect(api.put).toHaveBeenCalledWith("/producers/me", { logo_url: null });
    expect(screen.queryByTestId("logo-preview")).toBeNull();
  });

  it("a refused save shows the server's Hebrew reason and keeps the old logo", async () => {
    api.put.mockRejectedValueOnce({ response: { data: { detail: "אפשר לשמור רק תמונות שהעליתם בעצמכם" } } });
    renderCard("https://cdn/old.png");
    const file = new File(["x"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("logo-input"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("אפשר לשמור רק תמונות שהעליתם בעצמכם")).toBeTruthy());
    expect(screen.getByTestId("logo-preview").getAttribute("src")).toBe("https://cdn/old.png");
  });
});
