"use client";

import { passwordRules } from "@/lib/validators";

/**
 * Live password checklist — renders each rule with a tick as the user
 * types. Usage:
 *   <input type="password" value={pw} onChange={...} />
 *   <PasswordStrength password={pw} />
 *
 * Hidden when password is empty so forms don't show a "failing" checklist
 * before the user starts typing.
 */
export default function PasswordStrength({ password }) {
  if (!password) return null;
  return (
    <ul className="mt-2 space-y-1" aria-live="polite">
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
  );
}
