"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "user_city";
const EVENT_NAME = "mehamakor:city-changed";

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function useUserCity() {
  const [city, setCityState] = useState(null);

  useEffect(() => {
    setCityState(read());
    const onChanged = () => setCityState(read());
    window.addEventListener(EVENT_NAME, onChanged);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) onChanged();
    });
    return () => {
      window.removeEventListener(EVENT_NAME, onChanged);
    };
  }, []);

  const setCity = useCallback((newCity) => {
    try {
      if (newCity) {
        localStorage.setItem(STORAGE_KEY, newCity);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    setCityState(newCity || null);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }, []);

  const clearCity = useCallback(() => setCity(null), [setCity]);

  return { city, setCity, clearCity };
}
