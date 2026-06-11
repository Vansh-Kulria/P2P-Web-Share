/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#09090B',
          card: '#18181B',
          border: '#27272A',
          primary: '#FFFFFF',
          accent: '#A1A1AA',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'flat': '0 1px 3px rgba(0,0,0,0.1)',
      },
      animation: {
        'spin-fast': 'spin 1s linear infinite',
      }
    },
  },
  plugins: [],
}
