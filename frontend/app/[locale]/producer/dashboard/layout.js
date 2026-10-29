import RouteMessagesProvider from "@/components/i18n/RouteMessagesProvider";
import DashboardLayoutClient from "./DashboardLayoutClient";

// MEH-2233: server wrapper so the owner dashboard gets the namespaces the root
// client provider omits. The shell itself is unchanged in DashboardLayoutClient.jsx.
export default function ProducerDashboardLayout({ children }) {
  return (
    <RouteMessagesProvider>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </RouteMessagesProvider>
  );
}
