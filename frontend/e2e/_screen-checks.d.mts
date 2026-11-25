import type { Page } from "@playwright/test";

/** See _screen-checks.mjs (MEH-3816). */
export type LayoutFinding = { check: number; checkName: string; severity: string; detail: string };
export function runLayoutChecks(
  page: Page,
  viewportName: string,
): Promise<{ docW: number; W: number; H: number; viewport: string; out: LayoutFinding[] }>;
export function imageChecks(page: Page): Promise<{ broken: string[]; noAlt: string[] }>;
export function axeChecks(
  page: Page,
): Promise<{ id: string; impact: string; count: number; sample: string[] }[]>;
export function screenChecks(
  page: Page,
  label?: string,
): Promise<{
  viewport: { width: number; height: number };
  problems: string[];
  layout: Awaited<ReturnType<typeof runLayoutChecks>>;
  images: { broken: string[]; noAlt: string[] };
  axe: Awaited<ReturnType<typeof axeChecks>>;
}>;
