import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import BusinessCtaLink from "@/components/BusinessCtaLink";

// MEH-1489 chunk B — the shared auth-state-aware "become a business" CTA.
// Producer -> dashboard link; admin -> null; guest/consumer/authLoading ->
// the original join CTA (label+href via props/children, testid passthrough).

// next-intl: t("dashboard") under the "account.menu" scope -> the key path.
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

// i18n Link stub (createNavigation isn't loadable under jsdom).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

const authState = { user: null, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

beforeEach(() => {
  authState.user = null;
  authState.loading = false;
});

function renderCta() {
  return render(
    <BusinessCtaLink href="/register/producer" data-testid="join-cta" className="cta">
      join now
    </BusinessCtaLink>
  );
}

describe("BusinessCtaLink (MEH-1489)", () => {
  it("guest sees the original join CTA — href, children, testid preserved", () => {
    renderCta();
    const cta = screen.getByTestId("join-cta");
    expect(cta).toHaveTextContent("join now");
    expect(cta).toHaveAttribute("href", "/register/producer");
  });

  it("logged-in consumer sees the same join CTA (upgrade path, MEH-143)", () => {
    authState.user = { role: "consumer" };
    renderCta();
    expect(screen.getByTestId("join-cta")).toHaveAttribute("href", "/register/producer");
  });

  it("while auth is resolving, renders the guest CTA (SSR/first-paint default)", () => {
    authState.user = { role: "producer" };
    authState.loading = true;
    renderCta();
    // loading -> not yet swapped: original join CTA, keeps its testid + href.
    expect(screen.getByTestId("join-cta")).toHaveAttribute("href", "/register/producer");
  });

  it("producer sees a dashboard link, not the join CTA (no join-cta testid)", () => {
    authState.user = { role: "producer" };
    renderCta();
    expect(screen.queryByTestId("join-cta")).not.toBeInTheDocument();
    const link = screen.getByText("account.menu.dashboard");
    expect(link).toHaveAttribute("href", "/producer/dashboard");
    // styling still comes from the call site.
    expect(link).toHaveClass("cta");
  });

  it("admin sees nothing (component renders null)", () => {
    authState.user = { role: "admin" };
    const { container } = renderCta();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("join-cta")).not.toBeInTheDocument();
  });
});
