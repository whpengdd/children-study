// src/App.tsx
//
// Top-level app shell. For Wave 0 this is just the RouterProvider — no
// profile gate, no theme provider, no persisted Zustand subscription. Later
// waves will wrap this with global providers as needed.

import { RouterProvider } from "react-router-dom";

import { router } from "./router";

export default function App() {
  return <RouterProvider router={router} />;
}
