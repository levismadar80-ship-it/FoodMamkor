/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2D6A2D",
        "primary-light": "#3d8a3d",
        "primary-dark": "#1d4a1d",
        cream: "#FAF8F3",
        accent: "#E8823A",
        "accent-light": "#f0a060",
        "text-primary": "#1C1C1C",
        "text-secondary": "#6B6B6B",
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
