/**
 * A theme colour that accepts Tailwind's opacity modifier: with no modifier it is the variable
 * itself, with one (bg-plm-accent/20) it is the variable mixed toward transparent. The legacy
 * bg-opacity-* utilities (Tailwind passes `var(--tw-bg-opacity)`) are not used, so they get the
 * plain variable too.
 */
const plmColor = (name) => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === '1' || String(opacityValue).startsWith('var(')
    ? `var(--plm-${name})`
    : `color-mix(in srgb, var(--plm-${name}) calc(${opacityValue} * 100%), transparent)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Theme colours are CSS variables (src/index.css), mixed through plmColor() so opacity
        // modifiers such as bg-plm-accent/20 work. A bare 'var(--x)' silently drops them.
        'plm': {
          'bg': plmColor('bg'),
          'bg-light': plmColor('bg-light'),
          'bg-lighter': plmColor('bg-lighter'),
          'bg-secondary': plmColor('bg-secondary'),
          'sidebar': plmColor('sidebar'),
          'activitybar': plmColor('activitybar'),
          'panel': plmColor('panel'),
          'input': plmColor('input'),
          'border': plmColor('border'),
          'border-light': plmColor('border-light'),
          'fg': plmColor('fg'),
          'fg-dim': plmColor('fg-dim'),
          'fg-muted': plmColor('fg-muted'),
          'accent': plmColor('accent'),
          'accent-hover': plmColor('accent-hover'),
          'accent-dim': plmColor('accent-dim'),
          'selection': plmColor('selection'),
          'highlight': plmColor('highlight'),
          // Status colors
          'success': plmColor('success'),
          'warning': plmColor('warning'),
          'error': plmColor('error'),
          'info': plmColor('info'),
          // File state colors
          'wip': plmColor('wip'),
          'released': plmColor('released'),
          'in-review': plmColor('in-review'),
          'obsolete': plmColor('obsolete'),
          'locked': plmColor('locked'),
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'Monaco', 'monospace'],
        'sans': ['Plus Jakarta Sans', 'Inter', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: {
        'xxs': '10px',
        'xs': '11px',
        'sm': '12px',
        'base': '13px',
        'lg': '14px',
        'xl': '16px',
      },
      animation: {
        // GPU-accelerated spin for smooth animation during heavy JS work
        'spin': 'spin 1s linear infinite',
        'spin-slow': 'spin 2s linear infinite',
        'pulse-subtle': 'pulse 3s ease-in-out infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
        // Modal dialogs: a short scale-and-fade, eased out
        'dialog-in': 'dialogIn 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        // GPU-accelerated spin using translateZ(0) to force compositor layer
        spin: {
          'from': { transform: 'translateZ(0) rotate(0deg)' },
          'to': { transform: 'translateZ(0) rotate(360deg)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        dialogIn: {
          '0%': { opacity: '0', transform: 'translateY(4px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
