/**
 * MEH-3086 — "is this business already on the site?" under the business-name
 * field of the sign-up form.
 *
 * States: 0 matches (nothing) / 1 / many; short name (no request); a failed
 * or malformed answer (nothing). The hint never blocks the form.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import RegisterNameCheck from "@/components/RegisterNameCheck";

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) =>
    vars ? `${ns}.${key}:${vars.name}|${vars.city}` : `${ns}.${key}`,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

const NS = "auth.register.producer.name_check";
const PAST_DEBOUNCE_MS = 700;
const match = (over = {}) => ({ id: "p1", slug: null, name: "המאפייה של דנה", city: "חדרה", ...over });

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(PAST_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  apiGet.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("RegisterNameCheck (MEH-3086)", () => {
  it("0 matches: asks once after the pause, renders nothing", async () => {
    apiGet.mockResolvedValue({ data: { matches: [] } });
    render(<RegisterNameCheck name=" המאפייה של דנה " />);
    expect(apiGet).not.toHaveBeenCalled();
    await settle();
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith("/producer-name-check", { params: { name: "המאפייה של דנה" } });
    expect(screen.queryByTestId("register-name-check")).toBeNull();
  });

  it("1 match: names the business, links to its page and to /contact", async () => {
    apiGet.mockResolvedValue({ data: { matches: [match()] } });
    render(<RegisterNameCheck name="המאפייה של דנה" />);
    await settle();
    expect(screen.getByTestId("register-name-check")).toHaveTextContent(`${NS}.title`);
    const rows = screen.getAllByTestId("register-name-check-match");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("המאפייה של דנה|חדרה");
    expect(rows[0].querySelector("a")).toHaveAttribute("href", "/producer/p1");
    expect(screen.getByTestId("register-name-check-contact")).toHaveAttribute("href", "/contact");
  });

  it("many matches: one row each; a slug wins over the id, a missing city shows the name alone", async () => {
    apiGet.mockResolvedValue({
      data: { matches: [match(), match({ id: "p2", slug: "dana", city: null }), match({ id: "p3" })] },
    });
    render(<RegisterNameCheck name="המאפייה של דנה" />);
    await settle();
    const rows = screen.getAllByTestId("register-name-check-match");
    expect(rows).toHaveLength(3);
    expect(rows[1].querySelector("a")).toHaveAttribute("href", "/dana");
    expect(rows[1]).toHaveTextContent(/^המאפייה של דנה$/);
  });

  it("a name under 3 letters sends no request", async () => {
    render(<RegisterNameCheck name="טל" />);
    await settle();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("a failed request and a malformed answer both render nothing", async () => {
    apiGet.mockRejectedValueOnce(new Error("offline"));
    const { rerender } = render(<RegisterNameCheck name="המאפייה של דנה" />);
    await settle();
    expect(screen.queryByTestId("register-name-check")).toBeNull();

    apiGet.mockResolvedValueOnce({ data: { matches: [{ name: 5 }] } });
    rerender(<RegisterNameCheck name="המאפייה של דנה ובניה" />);
    await settle();
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("register-name-check")).toBeNull();
  });

  it("typing on clears the old hint before the next answer", async () => {
    apiGet.mockResolvedValue({ data: { matches: [match()] } });
    const { rerender } = render(<RegisterNameCheck name="המאפייה של דנה" />);
    await settle();
    expect(screen.getByTestId("register-name-check")).toBeInTheDocument();
    apiGet.mockResolvedValue({ data: { matches: [] } });
    rerender(<RegisterNameCheck name="המאפייה של דנה ב" />);
    expect(screen.queryByTestId("register-name-check")).toBeNull();
  });
});
