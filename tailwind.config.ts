import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tier1: "#a7f3d0", // green-200
        tier2: "#bae6fd", // sky-200
        tier3: "#fde68a", // amber-200
        tier4: "#fecaca", // red-200
      },
    },
  },
  plugins: [],
};

export default config;
