"use client";

import { useMemo } from "react";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";

// MEH-2233: a nested provider REPLACES its parent's messages (use-intl does
// not merge), so the route's extra namespaces are merged over the root set
// here. Top-level merge: the extra namespaces are ones the root set omits.
// timeZone / now / formats / onError / getMessageFallback are left undefined on purpose: use-intl's
// IntlProvider takes each from the parent provider when it is undefined.
export default function MergeMessagesProvider({ messages, children }) {
  const locale = useLocale();
  const parent = useMessages();
  const merged = useMemo(() => ({ ...parent, ...messages }), [parent, messages]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
