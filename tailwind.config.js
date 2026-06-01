/** @type {import('tailwindcss').Config} */

// Flat-dark + amber theme. The accent (formerly violet) and the neutral scale
// (formerly cool zinc) are remapped here so the whole app recolors without
// touching component classes. No glass, no glow, no blue->purple->pink gradient.

// Amber/gold accent ramp, tuned for contrast: 400 is a bright gold for text /
// borders / active states on dark; 600/700 are deep enough for white-on-accent
// buttons to stay legible.
const amber = {
  50: '#FBF4E4',
  100: '#F6E7C6',
  200: '#EDCF8E',
  300: '#E6BB5E',
  400: '#E0A82E',
  500: '#CE8F22',
  600: '#AE7016',
  700: '#8A5711',
  800: '#5F3C0D',
  900: '#3E280B',
  950: '#241705',
};

// Warm neutral ramp (replaces cool zinc) — neutrals tinted toward the brand hue.
const warm = {
  50: '#F7F5F0',
  100: '#EFEBE2',
  200: '#E0DACE',
  300: '#C2BAA9',
  400: '#9A9384',
  500: '#79736A',
  600: '#574F45',
  700: '#3A352C',
  800: '#2A261F',
  900: '#1B1915',
  950: '#131210',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Hanken Grotesk', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Remap so existing `violet-*` / `purple-*` / `zinc-*` utilities pick up the theme.
        violet: amber,
        purple: amber,
        zinc: warm,
        accent: amber,
        surface: {
          DEFAULT: '#131210',
          raised: '#1B1915',
          overlay: '#2A261F',
        },
      },
      boxShadow: {
        // Flat: one restrained card shadow, no colored glow.
        card: '0 1px 2px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
};
