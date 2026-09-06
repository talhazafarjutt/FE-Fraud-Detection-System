/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // NOTE: `theme` (not `theme.extend`) — civitasai.net's palette REPLACES
  // Tailwind's defaults. Leaving the defaults in place is how a console drifts
  // back to generic-admin-panel blue.
  theme: {
    // The whole site is border-radius: 0. The only radius in its stylesheet is
    // 50%, for circular graph nodes. Overriding (not extending) makes
    // `rounded-lg` a build error rather than a silent off-brand corner.
    borderRadius: { none: '0', DEFAULT: '0', full: '9999px' },
    // Depth comes from 1px rules and paper/surface contrast, never shadow.
    boxShadow: { none: 'none' },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      ink: {
        DEFAULT: 'var(--ink)',
        2: 'var(--ink-2)',
        3: 'var(--ink-3)',
        line: 'var(--ink-line)',
      },
      paper: 'var(--paper)',
      surface: 'var(--surface)',
      rule: { DEFAULT: 'var(--rule)', soft: 'var(--rule-soft)' },
      ultra: { DEFAULT: 'var(--ultra)', lift: 'var(--ultra-lift)' },
      carmine: 'var(--carmine)',
      amber: 'var(--amber)',
      sage: 'var(--sage)',
      'on-ink': 'var(--on-ink)',
      'on-ink-2': 'var(--on-ink-2)',
      'on-carmine': 'var(--on-carmine)',
      'on-ultra': 'var(--on-ultra)',
      // Surfaces that stay inverted on purpose, in both modes.
      band: 'var(--band)',
      'on-band': 'var(--on-band)',
      overlay: 'var(--overlay)',
    },
    fontFamily: {
      display: 'var(--display)',
      body: 'var(--body)',
      mono: 'var(--mono)',
    },
    extend: {
      maxWidth: { shell: 'var(--maxw)' },
      spacing: { pad: 'var(--pad)' },
      letterSpacing: {
        eyebrow: '.16em',
        label: '.13em',
        tag: '.1em',
        tight: '-.015em',
        tighter: '-.03em',
      },
      fontSize: { label: ['11px', { lineHeight: '1.2' }] },
    },
  },
  plugins: [],
};
