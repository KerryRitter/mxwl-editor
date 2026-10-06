/** @type {import('tailwindcss').Config} */
const brand = require('./src/shared/brand.json')

module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
        pixel: ['Pixelify Sans', 'ui-monospace', 'monospace']
      },
      colors: {
        brand: {
          accent: brand.accent, hover: brand.accentHover, ink: brand.accentInk,
          line: brand.line, background: brand.background, surface: brand.surface
        },
        neutral: {
          50: '#f6f8f1', 100: brand.foreground, 200: '#d4ddcf',
          300: '#c0cbb9', 400: brand.muted, 500: brand.faint,
          600: '#627461', 700: brand.line, 800: '#263327',
          900: brand.surface, 950: brand.background
        },
        emerald: {
          50: '#f2ffe9', 100: '#e4ffd0', 200: '#d1faa9',
          300: '#c7f995', 400: brand.accent, 500: '#a7e566',
          600: '#89c847', 700: '#6fa735', 800: '#436529',
          900: '#243b1c', 950: '#172510'
        }
      }
    },
    borderRadius: {
      none: '0', sm: '1px', DEFAULT: '2px', md: '2px',
      lg: '3px', xl: '4px', '2xl': '4px', '3xl': '6px', full: '9999px'
    }
  },
  plugins: []
}
