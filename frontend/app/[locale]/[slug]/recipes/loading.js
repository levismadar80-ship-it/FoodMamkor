// @ts-check
"use client";

// MEH-3983: a loading.js covers every segment below it, so without this file a
// recipe page would open on the BUSINESS page's frame ([slug]/loading.js). A
// recipe keeps the site-wide brand loader, as before.
export { default } from "../../loading";
