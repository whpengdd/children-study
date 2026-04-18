// src/App.tsx
//
// Top-level app shell. Initializes server sync on mount, then renders router.

import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";

import { router } from "./router";
import { migrateIfNeeded, startSyncLoop } from "./services/syncService";

export default function App() {
  useEffect(() => {
    // One-time migration of local IndexedDB data to server
    migrateIfNeeded().catch(() => {});
    // Start retry loop for any queued sync writes
    startSyncLoop();
  }, []);

  return <RouterProvider router={router} />;
}
