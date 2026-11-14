// @ts-check
// MEH-3177: /settings is a client page, which cannot export metadata, so this
// server layout carries its noindex. robots.txt blocks crawling, but a blocked
// URL that is linked can still be listed without noindex.
export const metadata = { robots: { index: false, follow: false } };

/** @param {{ children: import("react").ReactNode }} props */
export default function SettingsLayout({ children }) {
  return children;
}
