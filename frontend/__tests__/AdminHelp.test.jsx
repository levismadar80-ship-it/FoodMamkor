import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import he from "../messages/he.json";
import en from "../messages/en.json";
import AdminHelpPage from "@/app/[locale]/admin/help/page";
import { HELP_GROUPS, HELP_TOPICS } from "@/app/[locale]/admin/help/topics";
import { QUEUES } from "@/app/[locale]/admin/queues";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@phosphor-icons/react", async (importOriginal) => {
  const Stub = (props) => <span data-testid="icon" {...props} />;
  return { ...(await importOriginal()), CaretDown: Stub, Lifebuoy: Stub, MagnifyingGlass: Stub };
});

// Resolve against the REAL he.json, so the test reads the shipped copy and a
// topic id without copy fails here instead of rendering its key path.
vi.mock("next-intl", async () => {
  const messages = (await import("../messages/he.json")).default;
  const lookup = (key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), messages);
  return {
    useTranslations: (scope) => {
      const full = (key) => (scope ? `${scope}.${key}` : key);
      const t = (key) => {
        const v = lookup(full(key));
        if (typeof v !== "string") throw new Error(`missing string ${full(key)}`);
        return v;
      };
      t.raw = (key) => {
        const v = lookup(full(key));
        if (v === undefined) throw new Error(`missing raw ${full(key)}`);
        return v;
      };
      return t;
    },
  };
});

const ADMIN_DIR = path.resolve(__dirname, "../app/[locale]/admin");
const pathOf = (href) => href.split("?")[0];

// Every admin screen in the sidebar, read from the layout source (its
// NAV_SECTIONS is not exported) plus the shared queue list.
function sidebarHrefs() {
  const src = fs.readFileSync(path.join(ADMIN_DIR, "AdminLayoutClient.jsx"), "utf8");
  const fromLayout = [...src.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]);
  return [...new Set([...fromLayout, ...QUEUES.map((q) => q.href)])];
}

const question = (id) => he.admin.help.topics[id].q;

describe("AdminHelp — topic registry", () => {
  it("every sidebar screen has a help topic (except help itself)", () => {
    const hrefs = sidebarHrefs();
    // Control: the extraction must see the layout's items, or every check
    // below is vacuous.
    expect(hrefs).toContain("/admin/producers");
    expect(hrefs).toContain("/admin/settings");
    const covered = new Set(HELP_TOPICS.map((t) => pathOf(t.href)));
    const missing = hrefs.filter((h) => h !== "/admin/help" && !covered.has(h));
    expect(missing).toEqual([]);
  });

  it("every topic links to a route that exists", () => {
    const missing = HELP_TOPICS.map((t) => pathOf(t.href)).filter((href) => {
      const dir = path.join(ADMIN_DIR, href.replace(/^\/admin\/?/, ""));
      return !["page.js", "page.jsx"].some((f) => fs.existsSync(path.join(dir, f)));
    });
    expect(missing).toEqual([]);
  });

  it("ids are unique, groups are known, and he + en both carry copy for each", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const topic of HELP_TOPICS) {
      expect(HELP_GROUPS).toContain(topic.group);
      for (const messages of [he, en]) {
        const copy = messages.admin.help.topics[topic.id];
        expect(typeof copy?.q).toBe("string");
        expect(Array.isArray(copy?.steps) && copy.steps.length > 0).toBe(true);
      }
    }
    // No orphan copy: a topic removed from the registry takes its strings.
    expect(Object.keys(he.admin.help.topics).sort()).toEqual([...ids].sort());
  });
});

describe("AdminHelp — page", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("renders every topic question, grouped, all closed", () => {
    render(<AdminHelpPage />);
    for (const topic of HELP_TOPICS) {
      const btn = screen.getByRole("button", { name: question(topic.id) });
      expect(btn).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    for (const group of HELP_GROUPS) {
      expect(screen.getByRole("heading", { name: he.admin.layout.nav_sections[group] })).toBeInTheDocument();
    }
  });

  it("opening a topic shows its steps and a link to its screen; one open at a time", () => {
    render(<AdminHelpPage />);
    fireEvent.click(screen.getByRole("button", { name: question("kashrut") }));
    const kashrut = document.getElementById("kashrut");
    for (const step of he.admin.help.topics.kashrut.steps) {
      expect(kashrut.textContent).toContain(step);
    }
    expect(within(kashrut).getByRole("link")).toHaveAttribute("href", "/admin/kashrut");

    fireEvent.click(screen.getByRole("button", { name: question("reports") }));
    expect(screen.getByRole("button", { name: question("kashrut") })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link")).toHaveLength(1);

    // And closes again.
    fireEvent.click(screen.getByRole("button", { name: question("reports") }));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("search: many matches stay closed and hide non-matching groups", () => {
    render(<AdminHelpPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "מאשרים" } });
    const shown = screen.getAllByRole("button");
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.length).toBeLessThan(HELP_TOPICS.length);
    for (const btn of shown) expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: he.admin.layout.nav_sections.more })).toBeNull();
  });

  it("search: exactly one match opens it, and it can still be closed", () => {
    render(<AdminHelpPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "השם המבוקש" } });
    const only = screen.getAllByRole("button");
    expect(only).toHaveLength(1);
    expect(only[0]).toHaveAccessibleName(question("name_change_requests"));
    expect(only[0]).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(only[0]);
    expect(only[0]).toHaveAttribute("aria-expanded", "false");
  });

  it("search: zero matches says so", () => {
    render(<AdminHelpPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzzz-nothing" } });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(he.admin.help.no_results);
  });

  it("#topic in the URL opens that topic", () => {
    window.location.hash = "#approve";
    render(<AdminHelpPage />);
    expect(screen.getByRole("button", { name: question("approve") })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: question("reject") })).toHaveAttribute("aria-expanded", "false");
  });

  it("ships no infrastructure or repo links (MEH-2379)", () => {
    render(<AdminHelpPage />);
    for (const topic of HELP_TOPICS) {
      fireEvent.click(screen.getByRole("button", { name: question(topic.id) }));
      const href = within(document.getElementById(topic.id)).getByRole("link").getAttribute("href");
      expect(href.startsWith("/admin")).toBe(true);
    }
  });
});
