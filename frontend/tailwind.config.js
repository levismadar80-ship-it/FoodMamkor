/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2e6853",
        "primary-light": "#3a7d64",
        "primary-dark": "#1f4d3c",
        secondary: "#4cb08b",
        "secondary-light": "#6dc4a3",
        background: "#eaf4ee",
        accent: "#c9e2d3",
        "accent-warm": "#E8823A",
        "accent-warm-light": "#f0a060",
        "text-primary": "#1C1C1C",
        "text-secondary": "#6B6B6B",
        border: "#e8e0d0",
      },
      borderRadius: {
        DEFAULT: "12px",
      },
      fontFamily: {
        heebo: ["Heebo", "sans-serif"],
      },
    },
  },
  plugins: [],
};
