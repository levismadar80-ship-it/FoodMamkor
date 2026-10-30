/**
 * MEH-2602: text typed into a server-rendered field before hydration reaches
 * React state. Real hydration (renderToString + hydrateRoot), not a mock: the
 * bug only exists in the gap between the two. Run against BOTH Reacts — the
 * App Router renders with Next's vendored React 19 canary, while the installed
 * react@18 is what the rest of the suite uses, and the two lose the text
 * differently (18 also wipes a textarea's DOM value during hydration).
 */
import { describe, it, expect } from "vitest";
import * as React18 from "react";
import { renderToString as render18 } from "react-dom/server";
import { hydrateRoot as hydrate18 } from "react-dom/client";
import * as React19 from "next/dist/compiled/react";
import { renderToString as render19 } from "next/dist/compiled/react-dom/server.browser";
import { hydrateRoot as hydrate19 } from "next/dist/compiled/react-dom/client";
import { replayPrehydrationInput, startPrehydrationCapture, stopPrehydrationCapture } from "@/lib/replay-prehydration-input";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RUNTIMES = [
  { name: "React 19 (App Router)", React: React19, renderToString: render19, hydrateRoot: hydrate19 },
  { name: "React 18 (installed)", React: React18, renderToString: render18, hydrateRoot: hydrate18 },
];

describe.each(RUNTIMES)("replayPrehydrationInput — $name", ({ React, renderToString, hydrateRoot }) => {
  const h = React.createElement;
  let seen = {};
  let emailChanges = 0;
  const report = (state) => {
    seen = state;
  };

  function Form() {
    const [email, setEmail] = React.useState("");
    const [msg, setMsg] = React.useState("");
    const [agree, setAgree] = React.useState(false);
    React.useEffect(() => report({ email, msg, agree }));
    return h(
      "form",
      null,
      h("input", {
        id: "email",
        type: "email",
        value: email,
        onChange: (event) => {
          emailChanges += 1;
          setEmail(event.target.value);
        },
      }),
      h("input", { id: "free", type: "text", defaultValue: "" }),
      h("textarea", { id: "msg", value: msg, onChange: (event) => setMsg(event.target.value) }),
      h("input", { id: "agree", type: "checkbox", checked: agree, onChange: (event) => setAgree(event.target.checked) }),
    );
  }

  async function hydrateAfterTyping(typed) {
    const container = document.createElement("div");
    container.innerHTML = renderToString(h(Form));
    document.body.append(container);
    emailChanges = 0;
    stopPrehydrationCapture();
    startPrehydrationCapture(); // the page-load capture, re-armed per test
    // Real typing: the DOM value changes and an input event fires that React,
    // not yet attached, never hears.
    for (const [id, value] of Object.entries(typed)) {
      const el = container.querySelector(`#${id}`);
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    let root;
    await React.act(async () => {
      root = hydrateRoot(container, h(Form));
    });
    return { container, root };
  }

  it("control: without the replay, React state misses text typed before hydration", async () => {
    const { container, root } = await hydrateAfterTyping({ email: "early@example.com" });
    expect(container.querySelector("#email").value).toBe("early@example.com");
    expect(seen.email).toBe("");
    React.act(() => root.unmount());
  });

  it("replays typed input and textarea values into state", async () => {
    const { container, root } = await hydrateAfterTyping({ email: "early@example.com", msg: "שלום" });
    let count;
    await React.act(async () => {
      count = replayPrehydrationInput(container);
    });
    expect(count).toBe(2);
    expect(seen).toEqual({ email: "early@example.com", msg: "שלום", agree: false });
    expect(container.querySelector("#email").value).toBe("early@example.com");
    expect(container.querySelector("#msg").value).toBe("שלום");
    React.act(() => root.unmount());
  });

  it("leaves untouched fields alone and is a no-op on a second pass", async () => {
    const { container, root } = await hydrateAfterTyping({ msg: "x" });
    let first;
    let second;
    await React.act(async () => {
      first = replayPrehydrationInput(container);
    });
    await React.act(async () => {
      second = replayPrehydrationInput(container);
    });
    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(seen.email).toBe("");
    React.act(() => root.unmount());
  });

  it("never re-fires onChange for a field React heard typed after hydration", async () => {
    const { container, root } = await hydrateAfterTyping({});
    await React.act(async () => {
      replayPrehydrationInput(container); // first pass: nothing to do
    });
    const el = container.querySelector("#email");
    const setNative = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    await React.act(async () => {
      setNative.call(el, "late@example.com");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(seen.email).toBe("late@example.com");
    expect(emailChanges).toBe(1);
    let count;
    await React.act(async () => {
      count = replayPrehydrationInput(container); // the late pass
    });
    expect(count).toBe(0);
    expect(emailChanges).toBe(1);
    React.act(() => root.unmount());
  });

  it("leaves an uncontrolled field's DOM value alone", async () => {
    const { container, root } = await hydrateAfterTyping({ free: "own text" });
    let count;
    await React.act(async () => {
      count = replayPrehydrationInput(container);
    });
    expect(count).toBe(0);
    expect(container.querySelector("#free").value).toBe("own text");
    React.act(() => root.unmount());
  });
});
