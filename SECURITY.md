# Security policy · מדיניות אבטחה

## Reporting a vulnerability

Please report security problems privately to **contact@mehamakor.co.il**, with
the word `security` in the subject. Do not open a public GitHub issue, and do
not publish details before we have fixed the problem.

Please include what you found, the steps to reproduce it, and the URL or file
involved. We answer within 3 business days and tell you when it is fixed.

**In scope:** mehamakor.co.il, its API under `/api`, and the code in this
repository. **Out of scope:** reports that need a compromised device, social
engineering, denial-of-service or load tests, and findings from automated
scanners without a working proof.

Test only against your own account. Do not access, change or delete other
people's data, and stop as soon as you reach anything that is not yours.
We will not take legal action against research done in good faith under these
rules.

## דיווח על בעיית אבטחה

מצאת בעיית אבטחה? כתבו לנו בפרטיות ל-**contact@mehamakor.co.il** עם המילה
`security` בנושא, ואל תפרסמו לפני שתיקנו. נענה תוך 3 ימי עסקים.

The machine-readable contact file is
[`/.well-known/security.txt`](https://mehamakor.co.il/.well-known/security.txt).
When its `Expires` date is renewed, update `docs/ACCESS.md` §9 in the same PR.
