/**
 * Tailwind config — theme lives here.
 * To change the app theme (e.g. light ↔ dark): only edit the "colors" object below.
 * Use semantic names in components: bg-page, bg-surface, text-primary, text-muted,
 * border-border, btn-primary, btn-secondary, .input, .tab-selected, etc. (see src/index.css).
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
      },
      minHeight: {
        screen: '100dvh',
      },
      colors: {
        page: '#f9fafb',        // main background
        surface: '#ffffff',      // cards, panels, header
        primary: '#111827',      // buttons, selected tabs, key text
        muted: '#6b7280',        // secondary text
        'muted-light': '#9ca3af',
        border: '#e5e7eb',
        'border-strong': '#d1d5db',
        'on-primary': '#ffffff', // text on primary bg
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      })
    },
  ],
}
