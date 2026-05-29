import type { Config } from 'tailwindcss';

// Identidad +Activos: navy profundo, gold y teal de acento.
// Look profesional pero cálido — pensado para abrirse cada mañana.
export default {
  content: ['./index.html', './src/ui/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef2fb',
          100: '#d3ddf4',
          200: '#a6bbe8',
          300: '#6f8bd3',
          400: '#3f5cae',
          500: '#1f3a82',
          600: '#152a63',
          700: '#0f2050',
          800: '#0a1a40',
          900: '#0a1628',
          950: '#060d1a',
        },
        gold: {
          50: '#fbf6e7',
          100: '#f4e7bf',
          200: '#e8cf80',
          300: '#d9b54a',
          400: '#c9a227',
          500: '#a9851c',
          600: '#856719',
          700: '#624c17',
          800: '#403214',
          900: '#221a0b',
        },
        teal: {
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        // Semáforo
        signal: {
          green: '#16a34a',
          amber: '#d97706',
          red: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(10,22,40,0.08), 0 8px 24px rgba(10,22,40,0.06)',
        'card-hover': '0 4px 12px rgba(10,22,40,0.12), 0 16px 40px rgba(10,22,40,0.10)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
