import type { Config } from 'tailwindcss';

// Sistema de diseño Activos Academy — tokens institucionales exactos.
// Navy dominante · gold con restricción · cream para lectura.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './config/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0A1F44', // institucional primario
          deep: '#06122B', // profundidad, footer, métricas
        },
        gold: {
          DEFAULT: '#B8902F', // acento principal (con moderación)
          light: '#C9A961', // acento secundario, líneas, hovers
        },
        cream: {
          DEFAULT: '#F5F1E8', // fondo de lectura, papel
          card: '#FBF8F1', // tarjetas sobre cream
        },
        'line-navy': 'rgba(201,169,97,.20)', // divisores sobre navy
        'line-cream': 'rgba(10,31,68,.10)', // divisores sobre cream
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        display: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      maxWidth: {
        content: '1200px',
      },
      borderRadius: {
        // Bordes sutiles: 2–6px máximo (sin radios exagerados).
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .6s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
