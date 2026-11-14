// @ts-check
import RouteMessagesProvider from "@/components/i18n/RouteMessagesProvider";
import DashboardLayoutClient from "./DashboardLayoutClient";

// MEH-3177: never indexed. robots.txt alone did not cover the bare URL
// (its rule had a trailing slash), and a robots block without noindex still
// lets a linked URL appear in results.
export const metadata = { robots: { index: false, follow: false } };

// MEH-2233: server wrapper so the owner dashboard gets the namespaces the root
// client provider omits. The shell itself is unchanged in DashboardLayoutClient.jsx.
export default function ProducerDashboardLayout({ children }) {
  return (
    <RouteMessagesProvider>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </RouteMessagesProvider>
  );
}
