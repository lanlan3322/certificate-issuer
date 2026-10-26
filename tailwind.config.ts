import type { Config } from "tailwindcss";

const config: Config = {
  // Follow the NavBar theme toggle (html.dark), not the OS preference.
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1e3a5f",
        secondary: "#c9a227",
        accent: "#2d5a87",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;