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
    // order is contractual: logout() must fire before the sheet closes
    expect(logout.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0],
    );
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

  it("MEH-1228: producer sees the dashboard row first (→ /producer/dashboard)", () => {
    render(
      <AccountSheet {...baseProps()} user={{ name: "מיה", role: "producer" }} />,
    );
    expect(
      screen.getByRole("link", { name: /account\.menu\.dashboard/ }),
    ).toHaveAttribute("href", "/producer/dashboard");
    // first row: precedes favorites in DOM order
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs.indexOf("/producer/dashboard")).toBeLessThan(
      hrefs.indexOf("/favorites"),
    );
  });

  it("MEH-1228: consumer does not see the dashboard row", () => {
    render(
      <AccountSheet {...baseProps()} user={{ name: "דנה", role: "consumer" }} />,
    );
    expect(
      screen.queryByText("account.menu.dashboard"),
    ).not.toBeInTheDocument();
  });

  // MEH-669 gate, MEH-1703 chunk 3: this used to drive the `showBiz` prop
  // directly. The prop is gone — the sheet reads audience "consumer" off the
  // registry — so the test now drives the gate's REAL input, the user's role.
  //
  // That is strictly stronger than what it replaced: the prop-based version
  // passed even if the caller computed the predicate wrongly, because it set
  // the answer by hand. This version cannot.
  it("the MEH-669 gate hides the business CTA from producers and admins", () => {
    for (const role of ["producer", "admin"]) {
      const { unmount } = render(
        <AccountSheet {...baseProps()} user={{ name: "X", role }} />,
      );
      expect(
        screen.queryByText("account.sheet.biz_cta"),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("the business CTA shows for a guest and for a consumer", () => {
    for (const user of [null, { name: "דנה", role: "consumer" }]) {
      const { unmount } = render(<AccountSheet {...baseProps()} user={user} />);
      expect(
        screen.getByRole("link", { name: /account\.sheet\.biz_cta/ }),
      ).toHaveAttribute("href", "/register/producer");
      unmount();
    }
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
