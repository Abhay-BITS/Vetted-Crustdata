/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F6F2', surface: '#FFFFFF', ink: '#14201A', muted: '#56625B', line: '#E2E0D8',
        accent: { DEFAULT: '#17603F', soft: '#E5F1EA', ink: '#0F4A30' },
        ok: { DEFAULT: '#17603F', bg: '#E5F1EA' },
        warn: { DEFAULT: '#7A4E00', bg: '#FBF0D9' },
        bad: { DEFAULT: '#9E2418', bg: '#FAE6E2' },
        unk: { DEFAULT: '#3F4B54', bg: '#ECEFF1' },
        dup: { DEFAULT: '#0D5566', bg: '#E1F0F3' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '6px', lg: '8px' },
      boxShadow: { card: '0 1px 2px rgba(20,32,26,.06)', lift: '0 6px 18px rgba(20,32,26,.10)' },
    },
  },
  plugins: [],
}
