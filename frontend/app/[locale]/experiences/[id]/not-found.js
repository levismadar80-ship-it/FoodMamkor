// @ts-check
"use client";

/**
 * Module:   experiences/[id]/not-found
 * Purpose:  The server fetch is anonymous, so a workshop still waiting for
 *           review 404s on the server — including for its own host, who lands
 *           here right after submitting (experiences/new pushes to
 *           /experiences/{id}?pending=1). The page still carries noindex
 *           (measured 14/11 on a local build: 200 + noindex, the same status
 *           staging gives a missing workshop today); in the browser the client
 *           refetches with the viewer's token and shows the
 *           workshop to its host / an admin (with the «נשלח לבדיקה» banner), or
 *           its own «not found» message to everyone else.
 * Does NOT: decide visibility — the backend does (routers/experiences.py).
 * History:  MEH-3199 (creation).
 */
import { Suspense } from "react";
import ExperienceDetailClient from "./ExperienceDetailClient";

export default function ExperienceNotFound() {
  // useSearchParams (the ?pending=1 banner) needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <ExperienceDetailClient />
    </Suspense>
  );
}
