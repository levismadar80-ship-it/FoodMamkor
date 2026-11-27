/**
 * MEH-3447 (stage 4 of MEH-3264) — a recurring workshop's dates, on the three
 * surfaces that show them:
 *   1. the owner's form: «מועדים» inside «החוויה חוזרת» — 0 / 1 / many rows,
 *      add, remove (asks first when the date has sign-ups), the 12 cap, and
 *      what the form sends;
 *   2. the visitor's sign-up form: «מועד» first, required, a full date is
 *      that date's waitlist, the body carries the date;
 *   3. the owner's sign-up list: grouped per date.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceSessionsField, { SESSION_MAX } from "@/components/ExperienceSessionsField";
import ExperienceForm from "@/components/ExperienceForm";
import RegistrationCta from "@/components/RegistrationCta";
import RegistrationsList from "@/components/RegistrationsList";
import { timeValue } from "./helpers/time-of-day";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => null }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
}));

const N = he.experiences.new;
const S = he.registration.signup;
const C = he.registration.cta;

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

const date = (d, extra = {}) => ({ date: d, time: "10:00", participants_count: 0, ...extra });

beforeEach(() => vi.clearAllMocks());

describe("ExperienceSessionsField — the owner's dates", () => {
  function field(initial) {
    const onChange = vi.fn();
    const utils = wrap(<ExperienceSessionsField sessions={initial} onChange={onChange} />);
    return { onChange, ...utils };
  }
  const rows = () => screen.queryAllByTestId("experience-session-row");

  it("0 dates → the title, the hint and «הוספת מועד», no rows", () => {
    field([]);
    expect(screen.getByText(N.sessions_title)).toBeInTheDocument();
    expect(screen.getByText(N.sessions_hint)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
    expect(screen.getByTestId("experience-session-add").textContent).toBe(N.sessions_add);
  });

  it("1 / many dates → one row each, with date and time filled", () => {
    const { unmount } = field([date("2026-12-07")]);
    expect(rows()).toHaveLength(1);
    unmount();
    field([date("2026-12-07"), date("2026-12-14", { time: "18:30" })]);
    expect(rows()).toHaveLength(2);
    expect(timeValue(within(rows()[1]).getByLabelText(`${N.field_time} 2`))).toBe("18:30");
  });

  it("«הוספת מועד» adds an empty row", () => {
    const { onChange } = field([date("2026-12-07")]);
    fireEvent.click(screen.getByTestId("experience-session-add"));
    expect(onChange).toHaveBeenCalledWith([date("2026-12-07"), { date: "", time: "", participants_count: 0 }]);
  });

  it("removing a date with no sign-ups removes it at once", () => {
    const { onChange } = field([date("2026-12-07"), date("2026-12-14")]);
    fireEvent.click(screen.getAllByTestId("experience-session-remove")[0]);
    expect(screen.queryByTestId("experience-session-remove-confirm")).toBeNull();
    expect(onChange).toHaveBeenCalledWith([date("2026-12-14")]);
  });

  it("removing a date with sign-ups asks first; «ביטול» keeps it, the second button removes it", () => {
    const { onChange } = field([date("2026-12-07", { registered: 3 })]);
    fireEvent.click(screen.getByTestId("experience-session-remove"));
    const ask = screen.getByTestId("experience-session-remove-confirm");
    expect(ask.textContent).toContain("3");
    fireEvent.click(screen.getByRole("button", { name: N.cancel }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId("experience-session-remove-confirm")).toBeNull();

    fireEvent.click(screen.getByTestId("experience-session-remove"));
    fireEvent.click(screen.getByTestId("experience-session-remove-yes"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("a date with people on it is locked; one without stays editable", () => {
    field([date("2026-12-07", { registered: 2 }), date("2026-12-14", { registered: 0 })]);
    const [held, free] = rows();
    expect(within(held).getByLabelText(`${N.field_date} 1`)).toBeDisabled();
    // MEH-3955: the time is an hour and a minute select; both are locked.
    const heldSelects = within(held).getByLabelText(`${N.field_time} 1`).querySelectorAll("select");
    expect(heldSelects).toHaveLength(2);
    for (const el of heldSelects) expect(el).toBeDisabled();
    expect(within(free).getByLabelText(`${N.field_date} 2`)).not.toBeDisabled();
  });

  it("each row's controls are told apart by number once there are two", () => {
    const { unmount } = field([date("2026-12-07")]);
    expect(screen.getByLabelText(N.field_date)).toBeInTheDocument();
    unmount();
    field([date("2026-12-07"), date("2026-12-14")]);
    expect(screen.getByRole("button", { name: `${N.sessions_remove} 2` })).toBeInTheDocument();
  });

  it(`${SESSION_MAX} dates → no add button, the cap line instead`, () => {
    const twelve = Array.from({ length: SESSION_MAX }, (_, i) => date(`2027-01-${String(i + 1).padStart(2, "0")}`));
    field(twelve);
    expect(screen.queryByTestId("experience-session-add")).toBeNull();
    expect(screen.getByTestId("experience-sessions-full").textContent).toBe(N.sessions_max);
  });
});

describe("ExperienceForm — sends the dates", () => {
  const BASE = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "סדנת מחמצת שבועית",
    description: "סדנה בת שלוש שעות להכנת לחם מחמצת עם קמח מלא וטחון במקום",
    event_date: "2026-12-07",
    city: "חיפה",
    location_type: "public",
  };
  const editForm = (initial) => wrap(<ExperienceForm mode="edit" initial={{ ...BASE, ...initial }} />);
  const save = async () => {
    api.put.mockResolvedValue({ data: {} });
    fireEvent.click(screen.getByRole("button", { name: N.save_cta }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    return api.put.mock.calls[0][1];
  };

  it("a recurring workshop sends its filled dates, never a half-filled row", async () => {
    editForm({ is_recurring: true, sessions: [date("2026-12-07", { participants_count: 2, registered: 1 })] });
    expect(screen.getAllByTestId("experience-session-row")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("experience-session-add"));
    const body = await save();
    expect(body.sessions).toEqual([{ date: "2026-12-07", time: "10:00", participants_count: 2 }]);
  });

  it("a row with a date and no time blocks the save: «בחרו מועד.» and focus on the time", () => {
    editForm({ is_recurring: true, sessions: [date("2026-12-07")] });
    fireEvent.click(screen.getByTestId("experience-session-add"));
    const second = screen.getAllByTestId("experience-session-row")[1];
    fireEvent.change(within(second).getByLabelText(`${N.field_date} 2`), { target: { value: "2026-12-21" } });
    fireEvent.click(screen.getByRole("button", { name: N.save_cta }));
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByTestId("experience-sessions-incomplete").textContent).toBe(S.session_required);
    expect(document.activeElement).toBe(within(second).getByLabelText(`${N.field_time} 2`).querySelector("select"));
  });

  it("a one-off workshop shows no dates and sends none", async () => {
    editForm({ is_recurring: false });
    expect(screen.queryByTestId("experience-sessions")).toBeNull();
    const body = await save();
    expect(body).not.toHaveProperty("sessions");
  });
});

describe("RegistrationCta — «מועד» on a workshop with dates", () => {
  const SESSIONS = [
    { date: "2026-12-07", time: "10:00", spots_left: 4 },
    { date: "2026-12-14", time: "10:00", spots_left: 0 },
  ];
  function openForm(sessions = SESSIONS) {
    wrap(
      <RegistrationCta kind="experiences" itemId="x1" title="סדנת מחמצת" isFull={false} method="site_form" sessions={sessions} />,
    );
    fireEvent.click(screen.getByTestId("registration-open"));
  }
  const fill = () => {
    fireEvent.change(document.getElementById("signup-name"), { target: { value: "נועה כהן" } });
    fireEvent.change(document.getElementById("signup-phone"), { target: { value: "050-1112233" } });
    fireEvent.change(document.getElementById("signup-email"), { target: { value: "noa@example.com" } });
  };
  const select = () => /** @type {HTMLSelectElement} */ (document.getElementById("signup-session"));

  it("no dates → no «מועד» field", () => {
    openForm([]);
    expect(select()).toBeNull();
  });

  it("«מועד» is the first field and takes the focus; a full date says «· מלא»", () => {
    openForm();
    const form = screen.getByTestId("registration-form");
    expect(form.querySelector("input, select")).toBe(select());
    expect(document.activeElement).toBe(select());
    const options = [...select().options].map((o) => o.textContent);
    expect(options[0]).toBe(S.session_placeholder);
    expect(options).toHaveLength(3);
    expect(options[1]).not.toContain("מלא");
    expect(options[2]).toContain("מלא");
  });

  it("no date chosen → «בחרו מועד.» on the field, nothing sent", () => {
    openForm();
    fill();
    fireEvent.click(screen.getByTestId("registration-submit"));
    expect(screen.getByText(S.session_required)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("an open date → a sign-up for that date", async () => {
    api.post.mockResolvedValue({ data: { status: "registered" } });
    openForm();
    fireEvent.change(select(), { target: { value: "2026-12-07 10:00" } });
    fill();
    fireEvent.click(screen.getByTestId("registration-submit"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toEqual({
      name: "נועה כהן",
      phone: "050-1112233",
      email: "noa@example.com",
      party_size: 1,
      session_date: "2026-12-07",
      session_time: "10:00",
    });
  });

  it("a full date → the button says waitlist and the body asks for that date's waitlist", async () => {
    api.post.mockResolvedValue({ data: { status: "waitlisted" } });
    openForm();
    expect(screen.getByTestId("registration-submit").textContent).not.toBe(S.waitlist_submit);
    expect(screen.queryByTestId("registration-session-full")).toBeNull();
    fireEvent.change(select(), { target: { value: "2026-12-14 10:00" } });
    expect(screen.getByTestId("registration-submit").textContent).toBe(S.waitlist_submit);
    expect(screen.getByTestId("registration-session-full").textContent).toBe(C.full);
    fill();
    fireEvent.click(screen.getByTestId("registration-submit"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ session_date: "2026-12-14", waitlist: true });
  });

  it("the server says the date is gone → «בחרו מועד.» on the field, not a banner", async () => {
    api.post.mockRejectedValue({
      response: { status: 422, data: { detail: { code: "registration_session_required", message: "בחרו מועד." } } },
    });
    openForm();
    fireEvent.change(select(), { target: { value: "2026-12-07 10:00" } });
    fill();
    fireEvent.click(screen.getByTestId("registration-submit"));
    await waitFor(() => expect(select().getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText(S.session_required)).toBeInTheDocument();
  });

  it("the sign-up button keeps its wording on a workshop with dates", () => {
    wrap(<RegistrationCta kind="experiences" itemId="x1" title="t" isFull={false} method="site_form" sessions={SESSIONS} />);
    expect(screen.getByTestId("registration-open").textContent).toBe(C.signup_experience);
  });
});

describe("RegistrationsList — grouped per date", () => {
  const row = (n, extra = {}) => ({
    id: `r${n}`,
    name: `נרשמת ${n}`,
    phone: `050-000000${n}`,
    email: `r${n}@example.com`,
    status: "registered",
    party_size: 1,
    created_at: "2026-11-06T10:00:00Z",
    cancelled_at: null,
    session_date: null,
    session_time: null,
    ...extra,
  });
  async function openList(rows) {
    api.get.mockResolvedValue({ data: rows });
    wrap(<RegistrationsList kind="experiences" itemId="ex1" count={rows.length} />);
    const d = document.querySelector("[data-testid=registrations-list]");
    d.open = true;
    fireEvent(d, new Event("toggle"));
    await waitFor(() => expect(screen.queryAllByTestId("registration-row").length).toBeGreaterThan(0));
  }
  const titles = () => screen.queryAllByTestId("registrations-group-title").map((h) => h.textContent);

  it("no dated row → one list with no date titles (today's list)", async () => {
    await openList([row(1), row(2)]);
    expect(titles()).toEqual([]);
    expect(screen.getAllByTestId("registration-row")).toHaveLength(2);
  });

  it("one date → one titled group, counting places of registered rows only", async () => {
    const d = { session_date: "2026-12-07", session_time: "10:00:00" };
    await openList([row(1, { ...d, party_size: 2 }), row(2, { ...d, status: "cancelled" })]);
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain("10:00");
    expect(titles()[0]).toContain("2 רשומים");
  });

  it("many dates → one group each in date order, undated rows last with no title", async () => {
    await openList([
      row(1, { session_date: "2026-12-14", session_time: "10:00:00" }),
      row(2),
      row(3, { session_date: "2026-12-07", session_time: "10:00:00" }),
      row(4, { session_date: "2026-12-07", session_time: "10:00:00", status: "waitlisted" }),
    ]);
    const groups = screen.getAllByTestId("registrations-group");
    expect(groups).toHaveLength(3);
    expect(titles()).toHaveLength(2);
    expect(titles()[0]).toContain("7");
    expect(titles()[1]).toContain("14");
    // the waitlist row sits inside its own date's group
    expect(within(groups[0]).getByTestId("registrations-waitlist")).toBeInTheDocument();
    expect(within(groups[2]).queryByTestId("registrations-group-title")).toBeNull();
    expect(within(groups[2]).getByText("נרשמת 2")).toBeInTheDocument();
  });
});
