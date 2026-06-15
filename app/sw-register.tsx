"use client";

import { useEffect } from "react";

// Registers the service worker for installability + offline handling (spec §15.8).
// Renders nothing; runs once on mount.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed SW registration must never break the app.
      });
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
