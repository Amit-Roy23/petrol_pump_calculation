/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        sunk: v('sunk'),
        line: v('line'),
        ink: { DEFAULT: v('ink'), 2: v('ink-2'), 3: v('ink-3') },
        brand: { DEFAULT: v('brand'), soft: v('brand-soft'), ink: v('brand-ink') },
        petrol: { DEFAULT: v('petrol'), soft: v('petrol-soft') },
        diesel: { DEFAULT: v('diesel'), soft: v('diesel-soft') },
        premium: { DEFAULT: v('premium'), soft: v('premium-soft') },
        cng: { DEFAULT: v('cng'), soft: v('cng-soft') },
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },
        bad: { DEFAULT: v('bad'), soft: v('bad-soft') },
        lcd: { DEFAULT: v('lcd'), glow: v('lcd-glow'), dim: v('lcd-dim') },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Noto Sans Bengali"', 'system-ui', 'sans-serif'],
        sans: ['"Bricolage Grotesque Variable"', '"Noto Sans Bengali"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
      boxShadow: {
        card: '0 1px 0 rgb(var(--line)), 0 8px 24px -16px rgb(var(--shadow) / 0.35)',
        lift: '0 12px 32px -12px rgb(var(--shadow) / 0.45)',
      },
    },
  },
  plugins: [],
};
