// @ts-check
/**
 * MEH-3978: text a person typed (a product, a name, an address, a note) has a
 * direction of its own. Inside one of our sentences it is isolated with
 * FSI…PDI, the plain-text twin of <bdi>, so a Hebrew value in the English UI
 * (or an English one in Hebrew) keeps its order. Plain text, so it also works
 * in a message copied to WhatsApp.
 * https://www.w3.org/International/articles/inline-bidi-markup/
 * @param {string | null | undefined} text
 */
export function isolate(text) {
  return `⁨${text ?? ""}⁩`;
}
