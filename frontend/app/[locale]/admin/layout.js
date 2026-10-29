import RouteMessagesProvider from "@/components/i18n/RouteMessagesProvider";
import AdminLayoutClient from "./AdminLayoutClient";

// MEH-2233: server wrapper so the admin tree gets the namespaces the root
// client provider omits. The shell itself is unchanged in AdminLayoutClient.jsx.
export default function AdminLayout({ children }) {
  return (
    <RouteMessagesProvider>
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </RouteMessagesProvider>
  );
}
