import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx,css}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 
          500: '#1589D5',
          600: '#1278B8'
        },
        dark: { 900: '#0E3A5A' },
        background: '#E6F3FB'
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
};
export default config;