// @ts-check
// MEH-3623: the three business guides each carried the same buildBlocks():
// turn a page's block outline into the translated blocks GuideArticle renders.
// The outline (which block, which key) stays in each page.

/**
 * @typedef {{ type: string, key?: string, count?: number }} GuideBlockSpec
 * @param {GuideBlockSpec[]} structure
 * @param {(key: string) => string} t  translator scoped to the guide's namespace
 */
export function buildGuideBlocks(structure, t) {
  return structure.map((b) => {
    if (b.type === "hr") return b;
    if (b.count !== undefined) {
      return {
        type: b.type,
        items: Array.from({ length: b.count }, (_, i) => t(`body.${b.key}.i${i}`)),
      };
    }
    return { type: b.type, text: t(`body.${b.key}`) };
  });
}
