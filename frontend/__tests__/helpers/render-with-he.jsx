/**
 * MEH-3170: render under the real Hebrew catalog. A component that moved its
 * copy to messages/he.json keeps rendering the SAME Hebrew in a spec, read
 * from the file the app ships — not from a second copy in the test.
 *
 *   import { renderHe as render } from "./helpers/render-with-he";
 */
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../../messages/he.json";

function HeIntl({ children }) {
  return (
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      {children}
    </NextIntlClientProvider>
  );
}

export const renderHe = (ui, options) => render(ui, { wrapper: HeIntl, ...options });
