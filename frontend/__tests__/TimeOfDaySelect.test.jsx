// MEH-3955 — the one clock-time field of the site (ui/TimeOfDaySelect) and
// its date + time sibling (ui/DateTimeField): always 24-hour, an optional
// field can be left empty, and the two selects are named from one field name.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";

import he from "@/messages/he.json";
import TimeOfDaySelect from "@/components/ui/TimeOfDaySelect";
import DateTimeField from "@/components/ui/DateTimeField";
import { setTime, timeValue } from "./helpers/time-of-day";

const withIntl = (ui) => (
  <NextIntlClientProvider locale="he" messages={he}>
    {ui}
  </NextIntlClientProvider>
);

function Controlled({ initial = "", optional = false, onValue = () => {} }) {
  const [value, setValue] = useState(initial);
  return (
    <TimeOfDaySelect
      ariaLabel="משעה"
      optional={optional}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
      testId="t"
    />
  );
}

describe("TimeOfDaySelect", () => {
  it("offers the hours 00 to 23, never AM/PM, and names both selects from the field", () => {
    render(withIntl(<Controlled initial="18:30" />));
    const hour = screen.getByRole("combobox", { name: "משעה · שעה" });
    const minute = screen.getByRole("combobox", { name: "משעה · דקות" });
    const hours = [...hour.querySelectorAll("option")].map((o) => o.textContent);
    expect(hours[0]).toBe("00");
    expect(hours.at(-1)).toBe("23");
    expect(hours).toHaveLength(24);
    expect(hour.closest("[data-time-value]")?.textContent).not.toMatch(/AM|PM/);
    expect([hour.value, minute.value]).toEqual(["18", "30"]);
  });

  it("an optional field starts empty, its minutes wait for an hour, and it can be emptied again", () => {
    const onValue = vi.fn();
    render(withIntl(<Controlled optional onValue={onValue} />));
    const field = screen.getByTestId("t");
    expect(timeValue(field)).toBe("");
    expect(screen.getByRole("combobox", { name: "משעה · דקות" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "משעה · שעה" }), { target: { value: "09" } });
    expect(onValue).toHaveBeenLastCalledWith("09:00");
    setTime(field, "09:45");
    expect(onValue).toHaveBeenLastCalledWith("09:45");
    setTime(field, "");
    expect(onValue).toHaveBeenLastCalledWith("");
    expect(timeValue(field)).toBe("");
  });

  it("a required field with no value shows 00:00 and offers no empty hour", () => {
    render(withIntl(<Controlled />));
    const hour = screen.getByRole("combobox", { name: "משעה · שעה" });
    expect(hour.value).toBe("00");
    expect([...hour.querySelectorAll("option")].some((o) => o.value === "")).toBe(false);
  });

  it("a value off the five-minute step is kept, not rounded", () => {
    render(withIntl(<Controlled initial="18:07" />));
    expect(screen.getByRole("combobox", { name: "משעה · דקות" }).value).toBe("07");
  });

  it("an error is shown under the field and tied to the selects", () => {
    render(withIntl(<TimeOfDaySelect ariaLabel="עד שעה" label="עד שעה" value="09:00" onChange={() => {}} error="שעת הסיום צריכה להיות אחרי שעת ההתחלה" />));
    const hour = screen.getByRole("combobox", { name: "עד שעה · שעה" });
    expect(hour).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(hour.getAttribute("aria-describedby"))).toHaveTextContent("שעת הסיום צריכה להיות אחרי שעת ההתחלה");
  });
});

describe("DateTimeField", () => {
  function Form({ onValue, required = false }) {
    const [value, setValue] = useState("");
    return (
      <DateTimeField
        label="עד מתי"
        ariaLabel="עד מתי"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue(v);
        }}
        testId="dt"
        required={required}
      />
    );
  }

  it("gives «YYYY-MM-DDTHH:MM» only once both halves are set, and keeps the date picked first", () => {
    const onValue = vi.fn();
    render(withIntl(<Form onValue={onValue} />));
    const box = screen.getByTestId("dt");
    fireEvent.change(box.querySelector('input[type="date"]'), { target: { value: "2099-01-01" } });
    expect(onValue).toHaveBeenLastCalledWith("");
    expect(box.querySelector('input[type="date"]').value).toBe("2099-01-01");
    setTime(box.querySelector("[data-time-value]"), "12:30");
    expect(onValue).toHaveBeenLastCalledWith("2099-01-01T12:30");
  });

  it("an edit form's saved value fills both halves", () => {
    render(withIntl(<DateTimeField label="עד מתי" ariaLabel="עד מתי" value="2099-02-03T07:15" onChange={() => {}} testId="dt" />));
    const box = screen.getByTestId("dt");
    expect(box.querySelector('input[type="date"]').value).toBe("2099-02-03");
    expect(timeValue(box.querySelector("[data-time-value]"))).toBe("07:15");
  });

  it("a reset to an empty value from outside clears both halves", () => {
    const { rerender } = render(withIntl(<DateTimeField label="עד מתי" ariaLabel="עד מתי" value="2099-02-03T07:15" onChange={() => {}} testId="dt" />));
    rerender(withIntl(<DateTimeField label="עד מתי" ariaLabel="עד מתי" value="" onChange={() => {}} testId="dt" />));
    const box = screen.getByTestId("dt");
    expect(box.querySelector('input[type="date"]').value).toBe("");
    expect(timeValue(box.querySelector("[data-time-value]"))).toBe("");
  });

  it("a required field with a date and no time fails the browser's check, as datetime-local did", () => {
    render(withIntl(<Form onValue={() => {}} required />));
    const box = screen.getByTestId("dt");
    fireEvent.change(box.querySelector('input[type="date"]'), { target: { value: "2099-01-01" } });
    const hour = box.querySelector("[data-time-value] select");
    expect(hour.required).toBe(true);
    expect(hour.checkValidity()).toBe(false);
    setTime(box.querySelector("[data-time-value]"), "12:00");
    expect(box.querySelector("[data-time-value] select").checkValidity()).toBe(true);
  });

  it("the helper text describes both halves", () => {
    render(withIntl(<DateTimeField label="עד מתי" ariaLabel="עד מתי" helperText="לפי שעון ישראל" value="" onChange={() => {}} testId="dt" />));
    const box = screen.getByTestId("dt");
    for (const el of [box.querySelector('input[type="date"]'), ...box.querySelectorAll("select")]) {
      expect(document.getElementById(el.getAttribute("aria-describedby"))).toHaveTextContent("לפי שעון ישראל");
    }
  });
});

describe("TimeOfDaySelect, names and stored values", () => {
  it("with only a text label, the selects are named from it", () => {
    render(withIntl(<TimeOfDaySelect label="עד שעה" value="09:00" onChange={() => {}} />));
    expect(screen.getByRole("combobox", { name: "עד שעה · שעה" })).toBeTruthy();
  });

  it("a stored «HH:MM:SS» shows as HH:MM", () => {
    render(withIntl(<TimeOfDaySelect ariaLabel="משעה" value="18:30:00" onChange={() => {}} />));
    expect(screen.getByRole("combobox", { name: "משעה · שעה" }).value).toBe("18");
    expect(screen.getByRole("combobox", { name: "משעה · דקות" }).value).toBe("30");
  });
});
