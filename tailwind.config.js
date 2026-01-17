/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: '#006400',
        secondary: '#00BFFF',
        background: '#F8FAFC',
        card: '#FFFFFF',
        dark: '#0F172A',
        accent: '#FF4500',
        error: '#EF4444',
      },
    },
  },
  plugins: [],
}
