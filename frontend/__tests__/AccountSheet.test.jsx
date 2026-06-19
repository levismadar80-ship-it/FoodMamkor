import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AccountSheet from "@/components/AccountSheet";

// MEH-878: AccountSheet reads useTranslations() at the root (no namespace) —
// the mock echoes the key so assertions can target stable strings.
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// LanguageToggle pulls its own next-intl/navigation deps — stub it; the sheet
// only embeds it, it isn't part of this surface's behavior.
vi.mock("@/components/LanguageToggle", () => ({
  default: () => <button type="button">lang-toggle</button>,
}));

const baseProps = () => ({
  open: true,
  onClose: vi.fn(),
  user: null,
  logout: vi.fn(),
  showBiz: false,
});

describe("AccountSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<AccountSheet {...baseProps()} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("guest state: shows the login row and hides logout", () => {
    render(<AccountSheet {...baseProps()} user={null} />);
    expect(
      screen.getByRole("link", { name: /nav\.login/ }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.queryByText("account.menu.logout"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-label",
      "nav.account",
    );
  });

  it("logged-in state: logout button dispatches logout() then onClose()", () => {
    const logout = vi.fn();
    const onClose = vi.fn();
    render(
      <AccountSheet
        {...baseProps()}
        user={{ name: "דנה" }}
        logout={logout}
        onClose={onClose}
      />,
    );
    expect(screen.getByText("דנה")).toBeInTheDocument();
    // login row is gone once authenticated
    expect(screen.queryByText("nav.login")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /account\.menu\.logout/ }),
    );
    expect(logout).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders favorites + settings nav links with correct hrefs", () => {
    render(<AccountSheet {...baseProps()} user={{ name: "X" }} />);
    expect(
      screen.getByRole("link", { name: /nav\.favorites/ }),
    ).toHaveAttribute("href", "/favorites");
    expect(
      screen.getByRole("link", { name: /account\.menu\.settings/ }),
    ).toHaveAttribute("href", "/settings");
  });

  it("showBiz gates the business CTA", () => {
    const { rerender } = render(
      <AccountSheet {...baseProps()} showBiz={false} />,
    );
    expect(
      screen.queryByText("account.sheet.biz_cta"),
    ).not.toBeInTheDocument();

    rerender(<AccountSheet {...baseProps()} showBiz={true} />);
    expect(
      screen.getByRole("link", { name: /account\.sheet\.biz_cta/ }),
    ).toHaveAttribute("href", "/register/producer");
  });

  it("scrim click closes the sheet", () => {
    const onClose = vi.fn();
    render(<AccountSheet {...baseProps()} onClose={onClose} />);
    fireEvent.click(
      screen.getByRole("button", { name: "nav.menu_close" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
