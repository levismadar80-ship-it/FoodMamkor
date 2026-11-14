# MEH-2922 — regenerated `/register` VRT baselines, reviewed

As of 14/11/2026, bot commit ce90e570a (`vrt-regen:register`, run 516).

Both PNGs opened and read before merge (CLAUDE.md: a new baseline is a candidate):

- `register-mobile-linux.png`: the line «רוצה להוסיף את העסק שלך? הצטרפו כבית עסק»
  sits above «הצטרפות למהמקור» / «הצטרפו לקהילה», once; the bottom of the
  form shows only «יש לך כבר חשבון? כניסה לחשבון». No overlap, nothing clipped.
- `register-desktop-linux.png`: same order in the form column; the image
  pane is unchanged.

The only failures on the previous E2E run (53d2ec5) were these two
`parity.spec.ts:1294 › register` cells (desktop, mobile); 0 other failures,
0 flaky.
