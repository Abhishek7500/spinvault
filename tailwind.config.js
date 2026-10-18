/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        messenger: {
          blue: "#0084FF",
          "blue-dark": "#006FD6",
          ink: "#050505",
          muted: "#65676B",
          wash: "#F0F2F5",
          bubble: "#E4E6EB"
        }
      },
      boxShadow: {
        pane: "0 12px 40px rgba(0, 0, 0, 0.08)"
      }
    }
  },
  plugins: []
};
