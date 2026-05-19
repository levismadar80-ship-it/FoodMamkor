"use client";

import { useTranslations } from "next-intl";
import { passwordRules } from "@/lib/validators";

/**
 * Live password strength indicator + rule checklist.
 *
 * Shows two things when the password field has any content:
 *   1. Strength tier (weak / medium / strong) — an at-a-glance
 *      label + 3-segment bar based on how many of the password rules
 *      currently pass.
 *   2. Rule checklist — one row per rule with a tick/empty-circle
 *      marker so the user sees exactly WHAT is missing.
 *
 * Tier math:
 *   passed === 0 → no tier shown (field effectively empty)
 *   passed === 1 → weak (red)
 *   passed === 2 → medium (amber)
 *   passed === 3+ → strong (primary-green)
 *
 * Usage:
 *   <input type="password" value={pw} onChange={...} />
 *   <PasswordStrength password={pw} />
 *
 * Hidden when password is empty so forms don't show a "failing" checklist
 * before the user starts typing.
 */
export default function PasswordStrength({ password }) {
  const t = useTranslations("forms.password.strength");
  if (!password) return null;

  const passed = passwordRules.reduce(
    (count, rule) => count + (rule.check(password) ? 1 : 0),
    0,
  );
  const total = passwordRules.length;

  // Tier label + colors. Using inline hex for the amber tier (no token
  // for it in the brand palette, and the primary/red tokens cover the
  // other two). `#2e6853` is the project primary per CLAUDE.md.
  //
  // MEH-306: check `passed === total` FIRST so the all-rules-pass path
  // wins even when there's only one rule. Pre-MEH-306, `passwordRules`
  // had 4 entries and the `passed === 1` arm was unambiguously "weak";
  // post-MEH-306 the rules collapse to 1 (length only), and a single
  // passing rule means the floor is met → "strong".
  let tierLabel = "";
  let tierTextClass = "";
  let tierBarColor = "";
  if (passed >= total) {
    tierLabel = t("strong");
    tierTextClass = "text-primary";
    tierBarColor = "#2e6853";
  } else if (passed === 1) {
    tierLabel = t("weak");
    tierTextClass = "text-red-500";
    tierBarColor = "#ef4444"; // tailwind red-500
  } else if (passed === 2) {
    tierLabel = t("medium");
    tierTextClass = "text-amber-500";
    tierBarColor = "#f59e0b"; // tailwind amber-500
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
            aria-label={t("label", { tier: tierLabel })}
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
            {t("label", { tier: tierLabel })}
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
