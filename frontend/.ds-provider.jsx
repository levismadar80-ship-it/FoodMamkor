// design-sync preview provider. Supplies the runtime context the Mehamakor
// components read at render: next-intl messages (Hebrew) + a stub Next App
// Router / pathname / searchParams so components calling next/navigation hooks
// render instead of throwing "invariant expected app router to be mounted".
// Wired via cfg.extraEntries + cfg.provider = { component: "DSProvider" }.
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
  PathParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import messages from "./messages/he.json";

const noop = () => {};
const stubRouter = {
  push: noop,
  replace: noop,
  prefetch: () => Promise.resolve(),
  back: noop,
  forward: noop,
  refresh: noop,
};

export function DSProvider({ children }) {
  return (
    <NextIntlClientProvider locale="he" messages={messages} timeZone="Asia/Jerusalem">
      <AppRouterContext.Provider value={stubRouter}>
        <PathParamsContext.Provider value={{}}>
          <PathnameContext.Provider value="/">
            <SearchParamsContext.Provider value={new URLSearchParams()}>
              <div dir="rtl" lang="he">
                {children}
              </div>
            </SearchParamsContext.Provider>
          </PathnameContext.Provider>
        </PathParamsContext.Provider>
      </AppRouterContext.Provider>
    </NextIntlClientProvider>
  );
}
