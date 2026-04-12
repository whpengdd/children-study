// src/router.tsx
//
// Top-level route table. Every screen is a stub from Wave 0 and will be
// replaced wave-by-wave. No redirects or guards here yet — ProfileGate will
// eventually gate the rest of the routes in Wave 2.

import { createBrowserRouter } from "react-router-dom";

import ProfileGateScreen from "./screens/ProfileGate/ProfileGateScreen";
import PathSelectScreen from "./screens/PathSelect/PathSelectScreen";
import StudyScreen from "./screens/Study/StudyScreen";
import ReviewScreen from "./screens/Review/ReviewScreen";
import StatsScreen from "./screens/Stats/StatsScreen";
import SettingsScreen from "./screens/Settings/SettingsScreen";
import PetHomeScreen from "./screens/PetHome/PetHomeScreen";
import ShowScreen from "./screens/Show/ShowScreen";
import DevSandboxScreen from "./screens/DevSandbox/DevSandboxScreen";

export const router = createBrowserRouter([
  { path: "/",              element: <ProfileGateScreen /> },
  { path: "/path",          element: <PathSelectScreen /> },
  { path: "/study",         element: <StudyScreen /> },
  { path: "/review",        element: <ReviewScreen /> },
  { path: "/stats",         element: <StatsScreen /> },
  { path: "/settings",      element: <SettingsScreen /> },
  { path: "/pet",           element: <PetHomeScreen /> },
  { path: "/show/:skillId", element: <ShowScreen /> },
  // Dev-only: preview every scenario kind for visual regression testing.
  { path: "/dev/sandbox",   element: <DevSandboxScreen /> },
]);
