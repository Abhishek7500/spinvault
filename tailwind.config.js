/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        receipt: {
          forest: "#1A3C2B",
          leaf: "#5D9D73",
          mint: "#E9F4E7",
          canvas: "#F6F7F3",
          ink: "#18251F",
          muted: "#7A877D"
        }
      },
      boxShadow: {
        pane: "0 12px 40px rgba(0, 0, 0, 0.08)"
      }
    }
  },
  plugins: []
};
