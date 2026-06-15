/** @type {import('tailwindcss').Config} */

// Flat theme with a dark-teal accent and a CSS-variable-driven neutral scale, so the
// app supports BOTH a dark (default) and a light theme (toggled via `html.light`).
// The neutral ramp + surfaces resolve to CSS vars (defined per-theme in index.css);
// the teal accent is fixed (legible on both themes). No glass, no glow, no gradients.

// rgb(var) form keeps Tailwind opacity modifiers working (e.g. bg-zinc-900/50).
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

// Deep teal accent — fixed across themes. 300/400 read as the brand teal; 600/700 are
// dark enough for white-on-accent buttons (>= 4.5:1) on either background.
const teal = {
  50: '#E9F4F2',
  100: '#C8E6E1',
  200: '#9AD2CA',
  300: '#5EB6AB',
  400: '#2E9E92',
  500: '#1F8B80',
  600: '#15756B',
  700: '#0F5B54',
  800: '#0C4640',
  900: '#0A332E',
  950: '#06201D',
};

// Neutral ramp — values live in CSS vars (--n-*), swapped per theme in index.css.
const neutral = {
  50: v('--n-50'),
  100: v('--n-100'),
  200: v('--n-200'),
  300: v('--n-300'),
  400: v('--n-400'),
  500: v('--n-500'),
  600: v('--n-600'),
  700: v('--n-700'),
  800: v('--n-800'),
  900: v('--n-900'),
  950: v('--n-950'),
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Hanken Grotesk', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Remap so existing violet-*/purple-*/zinc-*/teal-* utilities pick up the theme.
        violet: teal,
        purple: teal,
        teal: teal,
        zinc: neutral,
        accent: teal,
        secondary: teal,
        surface: {
          DEFAULT: v('--bg'),
          raised: v('--bg-raised'),
          overlay: v('--bg-overlay'),
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
};
