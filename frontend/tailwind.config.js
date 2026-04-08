/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2e6853",        // ירוק כהה — כפתורים, לוגו
        "primary-light": "#3a7d64",
        "primary-dark": "#2E4A2E", // hero overlays, footer
        secondary: "#4cb08b",       // ירוק בינוני — הדגשות
        "secondary-light": "#6dc4a3",
        background: "#F5F0E8",      // קרם חם — לא לבן
        accent: "#8B6914",          // זהב חם — מחירים, הדגשות
        "accent-warm": "#E8823A",
        "accent-warm-light": "#f0a060",
        light: "#EAF3DE",           // ירוק בהיר — badges
        "site-text": "#1C1A17",     // שחור חם — לא pure black
        "site-muted": "#5c584f",    // warm muted gray — body copy de-emphasis
        "text-primary": "#1C1A17",
        "text-secondary": "#6B6B6B",
        border: "#e8e0d0",          // גבול חם
      },
      borderRadius: {
        DEFAULT: "16px",
      },
      fontFamily: {
        heebo: ["Heebo", "sans-serif"],
        headline: ['"Frank Ruhl Libre"', "serif"],
        english: ['"Cormorant Garamond"', "serif"],
        body: ['"DM Sans"', '"Heebo"', "sans-serif"],
        // Backwards-compat aliases for older classes still in the tree
        serif: ['"Frank Ruhl Libre"', "serif"],
        sans: ['"DM Sans"', '"Heebo"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
