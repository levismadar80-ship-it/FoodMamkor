"use client";

import { useEffect, useState } from "react";

/**
 * Returns true once per session for a given key (sessionStorage).
 * Safe on the server (always returns false until hydration).
 */
export function useFirstVisit(key) {
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(key)) {
      setIsFirst(true);
      sessionStorage.setItem(key, "1");
    }
  }, [key]);

  return isFirst;
}
