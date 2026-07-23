# Category icon licenses & provenance (MEH-683)

The unified category icon family in
[`frontend/components/CategoryIcons.jsx`](../../components/CategoryIcons.jsx)
combines three open-source sources. Every vendored glyph's path data is copied
verbatim (only the stroke width is normalized to the Phosphor line weight —
MEH-683 V4); no path geometry is altered. This file carries the required
attribution and full license texts.

| Glyph (component) | Category (DB name) | Source | Upstream name | License |
|---|---|---|---|---|
| `Meat` | בשר | Tabler Icons | `meat` | MIT |
| `Apple` | פירות | Tabler Icons | `apple` | MIT |
| `Chocolate` | שוקולד וממתקים בוטיק | Tabler Icons | `chocolate` | MIT |
| `Perfume` | קוסמטיקה טבעית | Tabler Icons | `perfume` | MIT |
| `Candle` | נרות וארומה | Tabler Icons | `candle` | MIT |
| `Hive` | דבש | Material Symbols | `hive` (outlined) | Apache-2.0 |
| `OliveOil` | שמנים | SVG Repo | `olive-oil` #201507 | CC0 1.0 |

The other 11 category glyphs (`FishSimple`, `Carrot`, `Cheese`, `Bread`, `Egg`,
`Jar`, `CookingPot`, `Pepper`, `Wine`, `HandSoap`, `FlowerLotus`) are
[`@phosphor-icons/react`](https://github.com/phosphor-icons/react) (MIT), a
runtime dependency — no vendoring, so its license ships with the package.

> **`OliveOil` provenance (MEH-683):** SVG Repo #201507 is CC0 (public domain —
> no attribution legally required; recorded here for the audit trail). The
> `svgrepo.com` host is outside the MEH-397 WebFetch allowlist and is refused at
> the sandbox proxy, so the vector source could not be transferred to Claude
> Code. The CC0 design (bottle + capped neck + vertical almond label) was
> **reproduced as line paths** on the family's 24 grid and stroke-normalized to
> match the Phosphor/Tabler weight (V4). CC0 explicitly permits reproduction and
> modification, so the redraw is licensed identically to the original.

---

## Tabler Icons — MIT License

Source: <https://github.com/tabler/tabler-icons> · Icons: `meat`, `apple`,
`chocolate`, `perfume`, `candle` (outline set).

```
MIT License

Copyright (c) 2020-2024 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Material Symbols — Apache License 2.0

Source: <https://github.com/google/material-design-icons> · Icon: `hive`
(Material Symbols, outlined). Copyright Google LLC.

Material Symbols are provided under the Apache License, Version 2.0. A NOTICE
is not required by Google for these assets, and no endorsement is implied.

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but not
      limited to compiled object code, generated documentation, and
      conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or Object
      form, made available under the License, as indicated by a copyright
      notice that is included in or attached to the work.

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship.

      "Contribution" shall mean any work of authorship, including the
      original version of the Work and any modifications or additions to
      that Work or Derivative Works thereof, that is intentionally submitted
      to Licensor for inclusion in the Work.

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work.

   4. Redistribution. You may reproduce and distribute copies of the Work
      or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You meet
      the conditions of retaining notices and attaching the License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      shall be under the terms and conditions of this License.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor.

   7. Disclaimer of Warranty. Unless required by applicable law or agreed
      to in writing, Licensor provides the Work on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied.

   8. Limitation of Liability. In no event and under no legal theory shall
      any Contributor be liable to You for damages arising as a result of
      this License or out of the use or inability to use the Work.

   9. Accepting Warranty or Additional Liability. While redistributing the
      Work, You may choose to offer, and charge a fee for, acceptance of
      support, warranty, indemnity, or other liability obligations.

   END OF TERMS AND CONDITIONS

   Copyright 2016 Google LLC

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

---

## SVG Repo #201507 "olive-oil" — CC0 1.0 (Public Domain Dedication)

- **Item:** <https://www.svgrepo.com/svg/201507/olive-oil>
- **License:** CC0 1.0 Universal — <https://creativecommons.org/publicdomain/zero/1.0/>
- **Provenance:** Verified as CC0 against the SVG Repo item page (Sapir,
  21/07/2026). CC0 places the work in the public domain — no attribution is
  legally required; this entry is kept for the audit trail (MEH-683 V3).
- **Form vendored:** reproduced as line paths on the icon family's 24 grid and
  stroke-normalized (V4) — see `OliveOil` in `CategoryIcons.jsx`. The vector
  source could not reach the CC sandbox (host blocked, MEH-397 + proxy 403), so
  the CC0 design was redrawn rather than byte-copied. CC0 permits this.

CC0 summary: the author has waived all copyright and related rights to the
work worldwide to the extent allowed by law. You can copy, modify, distribute,
and use the work, even for commercial purposes, all without asking permission.
