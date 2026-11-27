/**
 * Module:   design-system (local ESLint plugin)
 * Purpose:  Flag a hand-written basic element outside `components/ui/`, so a
 *           page builds from the shared owner instead of re-styling a raw tag.
 *           Modelled on Atlassian's `@atlaskit/eslint-plugin-design-system`
 *           (`no-html-button`, `no-html-select`, `no-placeholder`,
 *           `no-readonly-or-disabled-inputs` …), adapted to this repo's owners.
 * Does NOT: block anything by itself. Every rule is "warn"; the gate is
 *           `scripts/checks/eslint-ratchet.mjs` (GATED `design-system/`), where
 *           each rule's total may only go down.
 *           Does NOT cover a raw text <input> (owned by
 *           `__tests__/HandWrittenRatchet.test.js`) or a raw <img>
 *           (`@next/next/no-img-element`, already gated) — one owner per fact.
 *           `no-html-button` counts EVERY raw <button>; ButtonPrimitiveGuard
 *           keeps its narrower job (a raw button wearing the primary / danger /
 *           outlined recipe, per file). When the codemod brings those files to
 *           zero, that guard's ALLOWED list empties and it can be retired.
 * Blind spots (known, accepted): a non-literal `type` (`type={t}`) is not a
 *           checkbox or radio to these rules; a member-expression tag
 *           (`<motion.button>`) is not a raw element.
 * Related:  frontend/components/CLAUDE.md «Shared components» (the owner table
 *           each message points at); eslint.config.mjs (wiring + ui/ exemption).
 * History:  MEH-3829 (creation, parent MEH-3826). MEH-3955: `no-html-time`.
 */

/** Read a JSX attribute by name, or undefined. */
function attr(node, name) {
  return node.attributes.find((a) => a.type === "JSXAttribute" && a.name && a.name.name === name);
}

/** The literal string of an attribute (`type="checkbox"` or `type={"checkbox"}`), or null. */
function literal(a) {
  if (!a || !a.value) return null;
  if (a.value.type === "Literal") return String(a.value.value);
  const e = a.value.type === "JSXExpressionContainer" ? a.value.expression : null;
  if (e && e.type === "Literal") return String(e.value);
  if (e && e.type === "TemplateLiteral" && e.expressions.length === 0) return e.quasis[0].value.cooked;
  return null;
}

/** `disabled` / `disabled={true}` — a field that is off by design, not while saving. */
function alwaysTrue(a) {
  if (!a) return false;
  if (a.value === null) return true;
  const e = a.value.type === "JSXExpressionContainer" ? a.value.expression : null;
  return Boolean(e && e.type === "Literal" && e.value === true);
}

function tagName(node) {
  return node.name && node.name.type === "JSXIdentifier" ? node.name.name : null;
}

/**
 * One rule per element. `match(node)` decides whether this opening element is
 * the raw tag the rule is about.
 */
function elementRule(description, owner, match) {
  return {
    meta: {
      type: "suggestion",
      docs: { description },
      schema: [],
      messages: { raw: `${description}. Use ${owner} (frontend/components/CLAUDE.md «Shared components»).` },
    },
    create(context) {
      return {
        JSXOpeningElement(node) {
          if (match(node)) context.report({ node, messageId: "raw" });
        },
      };
    },
  };
}

const inputOfType = (types) => (node) => {
  if (tagName(node) !== "input") return false;
  return types.has(literal(attr(node, "type")) || "");
};

const FIELD_TAGS = new Set(["input", "textarea", "select", "Input", "Textarea", "Select"]);
const LABEL_PROPS = ["label", "aria-label", "aria-labelledby"];

function insideLabel(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "JSXElement" && tagName(p.openingElement) === "label") return true;
  }
  return false;
}

const noPlaceholderAsLabel = {
  meta: {
    type: "problem",
    docs: { description: "A field whose only name is its placeholder" },
    schema: [],
    messages: {
      only: "The placeholder is this field's only name; it disappears on typing and many screen readers skip it. Give it a label (the `label` prop of ui/Input, ui/Select, ui/Textarea, or a <label htmlFor>).",
    },
  },
  create(context) {
    // Collected from the AST (not the file text, so a comment or string that
    // says htmlFor does not count), and reported at the end of the file,
    // because a <label htmlFor> may come after its field.
    const literalTargets = new Set();
    let dynamicTarget = false;
    const pending = [];
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== "htmlFor") return;
        const v = literal(node);
        if (v) literalTargets.add(v);
        else dynamicTarget = true;
      },
      JSXOpeningElement(node) {
        const tag = tagName(node);
        if (!FIELD_TAGS.has(tag) || !attr(node, "placeholder")) return;
        if (tag === "input" && ["hidden", "submit", "button", "checkbox", "radio"].includes(literal(attr(node, "type")))) return;
        if (LABEL_PROPS.some((p) => attr(node, p))) return;
        if (node.attributes.some((a) => a.type === "JSXSpreadAttribute")) return; // props may carry the label
        if (insideLabel(node.parent)) return;
        pending.push(node);
      },
      "Program:exit"() {
        for (const node of pending) {
          const idAttr = attr(node, "id");
          const id = literal(idAttr);
          if (id && literalTargets.has(id)) continue;
          // id={x} next to htmlFor={x}: cannot be matched statically, so not reported.
          if (idAttr && !id && dynamicTarget) continue;
          context.report({ node, messageId: "only" });
        }
      },
    };
  },
};

const noReadonlyOrDisabledInputs = {
  meta: {
    type: "suggestion",
    docs: { description: "A field that is read-only, or disabled by design" },
    schema: [],
    messages: {
      off: "A {{what}} field cannot be reached or explained: a keyboard user may never land on it, and nothing says why it is off. Show the value as text, or say next to the field why it cannot be changed. Disabled while saving (`disabled={saving}`) is fine and not reported.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (!FIELD_TAGS.has(tagName(node))) return;
        const ro = attr(node, "readOnly");
        if (ro && (ro.value === null || literal(ro) !== "false")) {
          context.report({ node, messageId: "off", data: { what: "read-only" } });
          return;
        }
        if (alwaysTrue(attr(node, "disabled"))) context.report({ node, messageId: "off", data: { what: "permanently disabled" } });
      },
    };
  },
};

const HEADINGS = new Set(["h1", "h2", "h3"]);

// MEH-3955: a native time field shows AM/PM on a phone set to English, and no
// attribute can make it 24-hour. Counts <input> and ui/Input alike, since
// ui/Input passes `type` straight through.
const CLOCK_TYPES = new Set(["time", "datetime-local"]);
const isClockField = (node) => ["input", "Input"].includes(tagName(node) || "") && CLOCK_TYPES.has(literal(attr(node, "type")) || "");

const plugin = {
  meta: { name: "design-system" },
  rules: {
    "no-html-button": elementRule("A hand-written <button>", "ui/Button (IconButton for an icon-only control)", (n) => tagName(n) === "button"),
    "no-html-select": elementRule("A hand-written <select>", "ui/Select", (n) => tagName(n) === "select"),
    "no-html-textarea": elementRule("A hand-written <textarea>", "ui/Textarea", (n) => tagName(n) === "textarea"),
    "no-html-checkbox": elementRule("A hand-written checkbox <input>", "ui/Checkbox (ui/Switch for an on/off setting)", inputOfType(new Set(["checkbox"]))),
    "no-html-radio": elementRule("A hand-written radio <input>", "a shared radio group (none yet, MEH-3826) — keep the count from growing", inputOfType(new Set(["radio"]))),
    "no-html-heading": elementRule("A hand-written <h1>–<h3>", "ui/Heading or ui/SectionHeading", (n) => HEADINGS.has(tagName(n))),
    "no-html-anchor": elementRule("A hand-written <a>", "ui/Link, or Link from @/i18n/navigation for an internal page", (n) => tagName(n) === "a"),
    "no-html-time": elementRule("A native time field (type=\"time\" or \"datetime-local\"), which shows AM/PM on an English phone", "ui/TimeOfDaySelect, or ui/DateTimeField for a date and a time", isClockField),
    "no-placeholder-as-label": noPlaceholderAsLabel,
    "no-readonly-or-disabled-inputs": noReadonlyOrDisabledInputs,
  },
};

export default plugin;
