import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// MEH-476 PR 2: propagate request pathname so server components (e.g.
// app/[locale]/layout.js generateMetadata) can read it via headers().
// DO NOT remove without unwinding the headers() consumer in
// app/[locale]/layout.js — silent drift class (MEH-271 smell #2).
export default function middleware(req) {
  const pathname = req.nextUrl.pathname;
  req.headers.set("x-pathname", pathname);
  const response = intlMiddleware(req);
  response.headers.set("x-pathname", pathname);
  return response;
}



export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
