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
export { default as Tooltip } from "./Tooltip";
export { default as Popover } from "./Popover";
export { default as EmptyState } from "./EmptyState";
