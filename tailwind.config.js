/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Design tokens from design.md
      colors: {
        primary: '#1F4FA3',       // Primary blue
        action: '#F5B400',        // Action yellow
        background: '#F7F5F0',    // App background
        card: '#FFFFFF',          // Card background
        text: {
          DEFAULT: '#1B1B1F',     // Primary text
          secondary: '#5A5A63',   // Secondary text
        },
        border: '#E2DED5',        // Border color
        // Status colors
        status: {
          ayos: {
            text: '#1E8E4E',      // Green text
            bg: '#E3F4EA',        // Green background
          },
          malapit: {
            text: '#8A5A00',      // Yellow/amber text
            bg: '#FFF4D6',        // Yellow background
          },
          kulang: {
            text: '#9B2219',      // Red text
            bg: '#FBE3E1',        // Red background
          },
        },
      },
      fontSize: {
        // Design tokens: Base 18px; titles 24px; labels 16px; min 13px
        'sobre-min': ['13px', { lineHeight: '1.4' }],
        'sobre-label': ['16px', { lineHeight: '1.5' }],
        'sobre-base': ['18px', { lineHeight: '1.6' }],
        'sobre-title': ['24px', { lineHeight: '1.3', fontWeight: '700' }],
      },
      borderRadius: {
        // Design tokens: 16px cards, 14px buttons
        card: '16px',
        btn: '14px',
      },
      spacing: {
        // Design tokens: 12-16px spacing
        'sobre-sm': '12px',
        'sobre-md': '16px',
      },
      minHeight: {
        // Touch targets min 48px
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
      fontFamily: {
        // System sans-serif (Roboto on Android)
        sans: [
          'Roboto',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
