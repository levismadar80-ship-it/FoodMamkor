// @ts-check
import RouteMessagesProvider from "@/components/i18n/RouteMessagesProvider";
import AdminLayoutClient from "./AdminLayoutClient";

// MEH-3177: never indexed. robots.txt alone did not cover the bare URL
// (its rule had a trailing slash), and a robots block without noindex still
// lets a linked URL appear in results.
export const metadata = { robots: { index: false, follow: false } };

// MEH-2233: server wrapper so the admin tree gets the namespaces the root
// client provider omits. The shell itself is unchanged in AdminLayoutClient.jsx.
export default function AdminLayout({ children }) {
  return (
    <RouteMessagesProvider>
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </RouteMessagesProvider>
  );
}
