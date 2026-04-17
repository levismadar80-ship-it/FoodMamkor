"use client";

import { useEffect, useState } from "react";

const KEY = "user_city";
const EVENT = "mehamakor:city-changed";

export function getUserCity() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY) || null;
}

export function setUserCity(city) {
  if (typeof window === "undefined") return;
  if (city) {
    localStorage.setItem(KEY, city);
  } else {
    localStorage.removeItem(KEY);
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useUserCity() {
  const [city, setCityState] = useState(getUserCity);

  useEffect(() => {
    const handler = () => setCityState(getUserCity());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) handler();
    });
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  return city;
}
