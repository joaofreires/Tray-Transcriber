/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // use class strategy so our theme toggle works
  // include all relevant source files so Tailwind can tree-shake unused
  // styles. we use html/js/ts/tsx/jsx so that JSX components are scanned.
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
}
