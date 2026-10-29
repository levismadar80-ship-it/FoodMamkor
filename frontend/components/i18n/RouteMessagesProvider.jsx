import { getMessages } from "next-intl/server";
import { routeScopedMessages } from "@/lib/client-messages";
import MergeMessagesProvider from "./MergeMessagesProvider";

/**
 * MEH-2233: adds back, under one route, namespaces the root client provider
 * omits (lib/client-messages.js). Only the extra namespaces cross the wire —
 * the root set is already on the page — and the client merges the two.
 * `pick` narrows the extra set (the sign-up form needs one admin subtree).
 */
export default async function RouteMessagesProvider({ pick = routeScopedMessages, children }) {
  const messages = await getMessages();
  return <MergeMessagesProvider messages={pick(messages)}>{children}</MergeMessagesProvider>;
}
