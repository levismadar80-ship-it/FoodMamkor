"use client";

import { passwordRules } from "@/lib/validators";

/**
 * Live password strength indicator + rule checklist.
 *
 * Shows two things when the password field has any content:
 *   1. **Strength tier** (חלשה / בינונית / חזקה) — an at-a-glance
 *      label + 3-segment bar based on how many of the password rules
 *      currently pass. This is the "add strength indicator" piece of
 *      tasks_for_claude_code.md task 8.
 *   2. **Rule checklist** — the existing one: one row per rule with a
 *      tick/empty-circle marker so the user sees exactly WHAT is
 *      missing. Kept because it's strictly more useful than the tier
 *      alone; the tier summarizes, the checklist diagnoses.
 *
 * Tier math:
 *   passed === 0 → no tier shown (field effectively empty)
 *   passed === 1 → חלשה (weak, red)
 *   passed === 2 → בינונית (medium, amber)
 *   passed === 3 → חזקה (strong, primary-green)
 *
 * Usage:
 *   <input type="password" value={pw} onChange={...} />
 *   <PasswordStrength password={pw} />
 *
 * Hidden when password is empty so forms don't show a "failing" checklist
 * before the user starts typing.
 */
export default function PasswordStrength({ password }) {
  if (!password) return null;

  const passed = passwordRules.reduce(
    (count, rule) => count + (rule.check(password) ? 1 : 0),
    0,
  );
  const total = passwordRules.length;

  // Tier label + colors. Using inline hex for the amber tier (no token
  // for it in the brand palette, and the primary/red tokens cover the
  // other two). `#2e6853` is the project primary per CLAUDE.md.
  let tierLabel = "";
  let tierTextClass = "";
  let tierBarColor = "";
  if (passed === 1) {
    tierLabel = "חלשה";
    tierTextClass = "text-red-500";
    tierBarColor = "#ef4444"; // tailwind red-500
  } else if (passed === 2) {
    tierLabel = "בינונית";
    tierTextClass = "text-amber-500";
    tierBarColor = "#f59e0b"; // tailwind amber-500
  } else if (passed >= total) {
    tierLabel = "חזקה";
    tierTextClass = "text-primary";
    tierBarColor = "#2e6853";
  }

  return (
    <div className="mt-2" aria-live="polite">
      {/* Tier row — bar on the right (RTL start), label on the left.
          3 segments, lit in order as the rule count rises. */}
      {tierLabel && (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 flex gap-1"
            role="img"
            aria-label={`חוזק סיסמה: ${tierLabel}`}
          >
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{
                  backgroundColor: i < passed ? tierBarColor : "#e5e7eb", // gray-200
                }}
              />
            ))}
          </div>
          <span className={`text-xs font-medium ${tierTextClass}`}>
            חוזק סיסמה: {tierLabel}
          </span>
        </div>
      )}

      {/* Existing rule checklist — kept as granular feedback. */}
      <ul className="mt-2 space-y-1">
        {passwordRules.map((rule) => {
          const ok = rule.check(password);
          return (
            <li
              key={rule.id}
              className={`text-xs flex items-center gap-1.5 ${
                ok ? "text-primary" : "text-site-muted"
              }`}
            >
              <span aria-hidden="true">{ok ? "✓" : "○"}</span>
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
