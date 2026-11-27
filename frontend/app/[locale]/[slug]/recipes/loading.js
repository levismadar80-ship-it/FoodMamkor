// @ts-check
"use client";

/**
 * Module:   [slug]/recipes/loading
 * Purpose:  MEH-3983 — keeps the site-wide brand loader on recipe pages, which
 *           would otherwise inherit the business page's frame ([slug]/loading.js).
 * History:  MEH-3983 (creation).
 */

// MEH-3983: a loading.js covers every segment below it, so without this file a
// recipe page would open on the BUSINESS page's frame ([slug]/loading.js). A
// recipe keeps the site-wide brand loader, as before.
export { default } from "../../loading";
