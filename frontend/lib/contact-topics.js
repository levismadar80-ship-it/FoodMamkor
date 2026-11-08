/**
 * Module:   contact-topics
 * Purpose:  The one whitelist of contact-form topics, and the ?topic= reader
 *           that falls back to the default for anything else.
 * Does NOT: hold the labels — they live in messages/*.json under
 *           contact.topic_options.* (same keys).
 * Related:  backend/app/schemas/schemas.py CONTACT_TOPIC_LABELS (same keys;
 *           the backend prepends «נושא: <label>» to the stored message).
 * History:  MEH-1113 (whitelist + ?topic= prefill, on /about); MEH-2832 (moved
 *           here when /contact became the site's one contact form).
 */

export const CONTACT_TOPICS = ["general", "business", "correction", "other"];
export const DEFAULT_CONTACT_TOPIC = "general";

/** A whitelisted topic, or the default — silently, for any other value. */
export function contactTopicFrom(value) {
  return CONTACT_TOPICS.includes(value) ? value : DEFAULT_CONTACT_TOPIC;
}
