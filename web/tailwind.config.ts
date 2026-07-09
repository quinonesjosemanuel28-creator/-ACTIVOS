import type { Config } from 'tailwindcss';

// Sistema de diseño +Activos Holding — tokens exactos del Manual de Marca v1.0.
// Navy dominante (60) · blanco cálido (30) · dorado de acento (10).
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
          DEFAULT: '#0A1F44', // primario: fondos de impacto, texto, logo
          deep: '#06122B', // profundidad de gradientes y footer
        },
        gold: {
          DEFAULT: '#B8902F', // acento principal: líneas, detalles, CTA
          light: '#C9A961', // variante del dorado sobre fondo oscuro
        },
        warm: {
          DEFAULT: '#F8F7F3', // blanco cálido: fondo claro dominante
          card: '#FFFFFF', // tarjetas sobre blanco cálido
        },
        carbon: '#15171F', // paneles del software y modo oscuro
        // Acentos por unidad (arquitectura de marca)
        unit: {
          academy: '#B8902F',
          financiera: '#3F65A6',
          legal: '#24503C',
          software: '#2BB89C',
        },
        'line-navy': 'rgba(201,169,97,.20)', // divisores sobre navy
        'line-warm': 'rgba(10,31,68,.10)', // divisores sobre blanco cálido
      },
      fontFamily: {
        // Satoshi: una sola familia para todo el sistema (variable 300–900).
        sans: ['var(--font-satoshi)', 'system-ui', 'sans-serif'],
        display: ['var(--font-satoshi)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        content: '1200px',
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '10px', // tarjetas grandes (manual usa radios algo mayores en cards)
      },
    },
  },
  plugins: [],
};

export default config;
