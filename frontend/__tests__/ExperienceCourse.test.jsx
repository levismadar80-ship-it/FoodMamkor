/**
 * MEH-3898 — a course: one experience that meets several times, with ONE
 * sign-up for all of its meetings. The surfaces that show it:
 *   1. the owner's form: «קורס עם כמה מפגשים» swaps the one date for the
 *      meetings list (0 / 1 / many rows, closed / open), needs 2 whole
 *      meetings, and sends them with the first one as the date;
 *   2. the experience page: «קורס · N מפגשים» and one line per meeting;
 *   3. the list row: the same label in the meta line.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceSessionsField, { COURSE_MAX, courseMeetingsPayload } from "@/components/ExperienceSessionsField";
import ExperienceForm from "@/components/ExperienceForm";
import CourseMeetingsList from "@/components/CourseMeetingsList";
import { toEventEntry } from "@/lib/event-entry";

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
const D = he.experiences.detail;

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

const m = (date, time = "18:00") => ({ date, time });

beforeEach(() => vi.clearAllMocks());

describe("ExperienceSessionsField kind=course — the owner's meetings", () => {
  const rows = () => screen.queryAllByTestId("experience-session-row");
  function field(initial) {
    const onChange = vi.fn();
    wrap(<ExperienceSessionsField kind="course" sessions={initial} onChange={onChange} />);
    return onChange;
  }

  it("0 meetings → the course title, hint and «הוספת מפגש», no rows", () => {
    field([]);
    expect(screen.getByText(N.course_title)).toBeInTheDocument();
    expect(screen.getByText(N.course_hint)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
    expect(screen.getByTestId("experience-session-add").textContent).toBe(N.course_add);
  });

  it("«הוספת מפגש» adds an empty date + time row, with no places count", () => {
    const onChange = field([m("2027-01-05")]);
    fireEvent.click(screen.getByTestId("experience-session-add"));
    expect(onChange).toHaveBeenCalledWith([m("2027-01-05"), { date: "", time: "" }]);
  });

  it("removing a meeting removes it at once — a course has one sign-up, nothing to ask", () => {
    const onChange = field([m("2027-01-05"), m("2027-01-12")]);
    fireEvent.click(screen.getByRole("button", { name: `${N.course_remove} 1` }));
    expect(screen.queryByTestId("experience-session-remove-confirm")).toBeNull();
    expect(onChange).toHaveBeenCalledWith([m("2027-01-12")]);
  });

  it(`${COURSE_MAX} meetings → no add button, the cap line instead`, () => {
    const twenty = Array.from({ length: COURSE_MAX }, (_, i) => m(`2027-01-${String(i + 1).padStart(2, "0")}`));
    field(twenty);
    expect(screen.queryByTestId("experience-session-add")).toBeNull();
    expect(screen.getByTestId("experience-sessions-full").textContent).toBe(N.course_max);
  });

  it("courseMeetingsPayload keeps whole rows only, soonest first", () => {
    expect(courseMeetingsPayload([m("2027-01-12"), { date: "2027-01-19", time: "" }, m("2027-01-05", "09:30")])).toEqual([
      m("2027-01-05", "09:30"),
      m("2027-01-12"),
    ]);
  });
});

describe("ExperienceForm — a course", () => {
  const BASE = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "קורס גבנות מקצועי",
    description: "קורס של חמישה מפגשים להכנת גבינות במחלבה, מהחלב ועד הגבינה המוכנה",
    event_date: "2027-01-05",
    city: "לוטם",
    location_type: "public",
  };
  const editForm = (initial) => wrap(<ExperienceForm mode="edit" initial={{ ...BASE, ...initial }} />);
  const saveClick = () => fireEvent.click(screen.getByRole("button", { name: N.save_cta }));
  const save = async () => {
    api.put.mockResolvedValue({ data: {} });
    saveClick();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    return api.put.mock.calls[0][1];
  };

  it("closed (not a course): the one date field shows, no meetings list, and none is sent", async () => {
    editForm({});
    expect(screen.getByLabelText(new RegExp(N.field_date))).toBeInTheDocument();
    expect(screen.queryByTestId("experience-course-meetings")).toBeNull();
    const body = await save();
    expect(body.course_meetings).toEqual([]);
    expect(body.event_date).toBe("2027-01-05");
  });

  it("open with 0 meetings: the date field gives way to the list, and saving asks for 2", () => {
    editForm({});
    fireEvent.click(screen.getByRole("checkbox", { name: N.is_course }));
    expect(screen.getByTestId("experience-course-meetings")).toBeInTheDocument();
    expect(document.getElementById("experience-date")).toBeNull();
    saveClick();
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByTestId("experience-course-error").textContent).toBe(N.course_error);
    // Nothing to fill yet: focus goes to «הוספת מפגש».
    expect(document.activeElement).toBe(screen.getByTestId("experience-session-add"));
  });

  it("open with 1 meeting: still refused — a course has at least 2", () => {
    editForm({ course_meetings: [m("2027-01-05")] });
    expect(screen.getAllByTestId("experience-session-row")).toHaveLength(1);
    saveClick();
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByTestId("experience-course-error")).toBeInTheDocument();
  });

  it("open with many meetings: sends them soonest first, the first as the date", async () => {
    // A stale stored date: the course's date is its first meeting, not this.
    editForm({ event_date: "2027-03-01", course_meetings: [m("2027-01-12"), m("2027-01-05")] });
    expect(screen.getAllByTestId("experience-session-row")).toHaveLength(2);
    const body = await save();
    expect(body.course_meetings).toEqual([m("2027-01-05"), m("2027-01-12")]);
    expect(body.event_date).toBe("2027-01-05");
    expect(body.event_time).toBe("18:00");
  });

  it("a course is never recurring: ticking «חוזרת» unticks the course", () => {
    editForm({ course_meetings: [m("2027-01-05"), m("2027-01-12")] });
    const course = screen.getByRole("checkbox", { name: N.is_course });
    expect(course).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: N.is_recurring }));
    expect(course).not.toBeChecked();
    expect(screen.queryByTestId("experience-course-meetings")).toBeNull();
  });
});

describe("CourseMeetingsList — the experience page", () => {
  it("0 meetings (not a course) → nothing", () => {
    const { container } = wrap(<CourseMeetingsList meetings={[]} />);
    expect(container.textContent).toBe("");
  });

  it("1 meeting → one numbered line", () => {
    wrap(<CourseMeetingsList meetings={[m("2027-01-05")]} />);
    const lines = screen.getAllByTestId("experience-course-meeting");
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain(D.course_meeting.replace("{n}", "1"));
    expect(lines[0].textContent).toContain("18:00");
  });

  it("many meetings → one line each, in order", () => {
    wrap(<CourseMeetingsList meetings={[m("2027-01-05"), m("2027-01-12"), m("2027-01-19", "10:00")]} />);
    const lines = screen.getAllByTestId("experience-course-meeting");
    expect(lines).toHaveLength(3);
    expect(lines[2].textContent).toContain(D.course_meeting.replace("{n}", "3"));
    expect(lines[2].textContent).toContain("10:00");
  });
});

describe("toEventEntry — the list row", () => {
  const t = (key, vars) => (key === "course_meetings" ? `קורס · ${vars.count} מפגשים` : key);
  it("a course says «קורס · N מפגשים» in its meta line", () => {
    const row = { id: "x", title: "קורס", course_meetings: [m("2027-01-05"), m("2027-01-12")], is_recurring: false };
    expect(toEventEntry(row, "experiences", t).schedule).toBe("קורס · 2 מפגשים");
  });
  it("a one-off experience has no schedule line", () => {
    expect(toEventEntry({ id: "x", title: "סדנה", course_meetings: [] }, "experiences", t).schedule).toBeNull();
  });
});
