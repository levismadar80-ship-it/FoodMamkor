# E2E locator strategy — `data-testid` only (MEH-495)

## Rule

All **new** Playwright E2E tests must locate elements via
`page.getByTestId('<id>')`. Existing text-locator tests migrate
opportunistically — when a test is touched for any reason (bug fix,
refactor, copy change), convert its locators in the same PR.

## Why

- **Translation-resistant.** Hebrew copy edits and the MEH-366 i18n
  sweep silently break `getByText("שלחי")` selectors. `data-testid` is
  invariant under copy changes.
- **Editorial-resistant.** Marketing/UX edits to button labels,
  headings, and microcopy don't cascade into red CI runs.
- **Lower flake rate.** TestDino + Cal.com PR #27148 ("test: replace
  text locators with data-testid selectors") cite locator stability as
  the #1 win in suite-wide flake reduction.

## Naming convention

`kebab-case`, prefixed by surface. Examples:

- `producer-card-cta`
- `whatsapp-button`
- `review-form-submit`
- `availability-toggle-vacation`
- `home-product-form-name`

Surface prefix prevents collisions when the same control type appears
on two pages (e.g. `producer-edit-submit` vs `home-product-form-submit`).

## When to add `data-testid` to a component

**Only when a test will actually use it.** Don't sprinkle attributes
preemptively — they become DOM noise and drift out of date. Add the
attribute and the test together in the same commit.

## Migration policy

Organic, not big-bang. When a refactor or fix touches an existing
test (e.g. closing MEH-269), convert its `getByText` / `:has-text()`
locators to `getByTestId` in the same PR. No mass-migration ticket
exists or should be filed — opportunistic conversion is sufficient.

## Worked example

**Before** (text locator, breaks on copy edit + translation):

```ts
test('home product submit', async ({ page }) => {
  await page.goto('/neighbor/new');
  await page.getByLabel('שם המוצר').fill('חלה מתוקה');
  await page.getByRole('button', { name: 'פרסמי מוצר' }).click();
  await expect(page.getByText('המוצר פורסם')).toBeVisible();
});
```

**After** (`data-testid`, copy-invariant):

```ts
test('home product submit', async ({ page }) => {
  await page.goto('/neighbor/new');
  await page.getByTestId('home-product-form-name').fill('חלה מתוקה');
  await page.getByTestId('home-product-form-submit').click();
  await expect(page.getByTestId('home-product-success-toast')).toBeVisible();
});
```

## Anti-patterns

- ✗ **`getByRole` alone** when the role + accessible name pair embeds
  Hebrew copy. Either pair `getByRole` with `data-testid`, or use
  `getByTestId` directly.
- ✗ **`:has-text()` selectors.** Same flake class as `getByText` — copy
  changes silently invalidate the selector.
- ✗ **Preemptive `data-testid` sprinkling.** Attributes added "just in
  case" become stale, undermine grep-ability, and clutter the DOM.

## References

- [Cal.com PR #27148](https://github.com/calcom/cal.com/pull/27148) — the
  canonical migration precedent.
- TestDino flake research — `testdino.com/blog/playwright-flaky-tests/`.
- MEH-270 (research) §3 — "data-testid as the only locator strategy".
- MEH-366 (i18n sweep) — text-locator class breaks under translation.
