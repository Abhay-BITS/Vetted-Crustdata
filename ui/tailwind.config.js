/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'oklch(0.982 0.002 84.559)',
        ink: 'oklch(0.289 0 0)',
        muted: 'oklch(0.556 0.008 84.559)',
        soft: 'oklch(0.965 0.004 84.559)',
        panel: 'oklch(0.958 0.005 84.559)',
        line: 'oklch(0.912 0.006 84.559)',
        card: 'oklch(0.992 0.001 84.559)',
        ok: { DEFAULT: 'oklch(0.45 0.08 150)', bg: 'oklch(0.95 0.03 150)' },
        warn: { DEFAULT: 'oklch(0.5 0.1 70)', bg: 'oklch(0.95 0.04 80)' },
        bad: { DEFAULT: 'oklch(0.5 0.14 30)', bg: 'oklch(0.95 0.03 30)' },
        unk: { DEFAULT: 'oklch(0.45 0.01 84)', bg: 'oklch(0.94 0.005 84)' },
        dup: { DEFAULT: 'oklch(0.45 0.06 230)', bg: 'oklch(0.95 0.02 230)' },
      },
      fontFamily: {
        sans: ['Switzer', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { DEFAULT: '10px', xl: '16px', '2xl': '20px' },
      boxShadow: {
        frame: '0 1px 2px oklch(0.289 0 0 / .04), 0 12px 40px -12px oklch(0.289 0 0 / .14)',
        float: '0 1px 2px oklch(0.289 0 0 / .05), 0 8px 24px -10px oklch(0.289 0 0 / .18)',
      },
      maxWidth: { site: '76rem' },
    },
  },
  plugins: [],
}
