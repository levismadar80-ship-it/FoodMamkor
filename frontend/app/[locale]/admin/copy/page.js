// @ts-check
/**
 * Module:   admin/copy (page)
 * Purpose:  MEH-3672. Server wrapper for «טקסטים באתר»: hands the Hebrew
 *           messages and the generated screen index to the client screen,
 *           so the browser does no fetch. Access is the admin shell's, like
 *           every /admin page (AdminLayoutClient.jsx); the text itself is the
 *           public site copy.
 * History:  MEH-3672 (creation).
 */
import he from "@/messages/he.json";
import index from "@/lib/generated/copy-screens.json";
import CopyScreenClient from "./CopyScreenClient";

export default function AdminCopyPage() {
  return <CopyScreenClient messages={he} index={index} />;
}
