import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/**/*.tsx",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1200px" },
    },
    extend: {
      colors: {
        // Palette sombre moderne (inspirée sportsbooks)
        bg: {
          DEFAULT: "#0B0F12",
          soft: "#0F151A",
          card: "#121A21",
          hover: "#1A242E",
        },
        fg: {
          base: "#E6EAF0",
          muted: "#B5C0CC",
          subtle: "#8FA0B2",
        },
        primary: {
          DEFAULT: "#10E8A7",
          50: "#E6FFF7",
          100: "#C0FFE9",
          200: "#8AFFD8",
          300: "#4CFFC8",
          400: "#21F4B3",
          500: "#10E8A7",
          600: "#0BC091",
          700: "#089D7D",
          800: "#077B66",
          900: "#065E53",
        },
        accent: { yellow: "#FFC857", red: "#FF5C5C", blue: "#4DB6FF" },
        line: "#1F2A34",
        win: "#17C964",
        lose: "#F31260",
        neutral: "#8896A3",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 6px 20px rgba(0,0,0,.35)",
        glow: "0 0 0 1px rgba(16,232,167,.25), 0 8px 40px rgba(16,232,167,.1)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
