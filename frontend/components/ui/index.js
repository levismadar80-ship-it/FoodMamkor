/**
 * Barrel export for the atomic UI layer (MEH-602).
 *
 * Lets pages import the foundation in one line:
 *   import { Button, Card, Badge, Heading, Link, Input } from "@/components/ui";
 *
 * Tooltip + EmptyState are pre-existing primitives re-exported here so the
 * whole `components/ui/` surface is reachable from a single entry point.
 */
export { default as Button } from "./Button";
export { default as Input } from "./Input";
export { default as Card } from "./Card";
export { default as Badge } from "./Badge";
export { default as Heading } from "./Heading";
export { default as Link } from "./Link";
// MEH-999: one owner for dashboard "back to X" links (target + arrow + copy).
export { default as BackLink } from "./BackLink";
export { default as Tooltip } from "./Tooltip";
export { default as Popover } from "./Popover";
export { default as EmptyState } from "./EmptyState";
// MEH-3132: every primitive in this folder is reachable from here;
// ComponentCatalogGuard.test.js reds a new one that is not.
export { default as Avatar } from "./Avatar";
export { default as Dialog } from "./Dialog";
export { default as FactLine } from "./FactLine";
export { default as InlineMessage } from "./InlineMessage";
export { default as RatingCompact } from "./RatingCompact";
export { default as SectionHeading } from "./SectionHeading";
export { default as ShowMore } from "./ShowMore";
export { default as Switch } from "./Switch";
