/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'pdm': {
          // Theme-aware colors using CSS variables
          'bg': 'var(--pdm-bg)',
          'bg-light': 'var(--pdm-bg-light)',
          'bg-lighter': 'var(--pdm-bg-lighter)',
          'bg-secondary': 'var(--pdm-bg-secondary)',
          'sidebar': 'var(--pdm-sidebar)',
          'activitybar': 'var(--pdm-activitybar)',
          'panel': 'var(--pdm-panel)',
          'input': 'var(--pdm-input)',
          'border': 'var(--pdm-border)',
          'border-light': 'var(--pdm-border-light)',
          'fg': 'var(--pdm-fg)',
          'fg-dim': 'var(--pdm-fg-dim)',
          'fg-muted': 'var(--pdm-fg-muted)',
          'accent': 'var(--pdm-accent)',
          'accent-hover': 'var(--pdm-accent-hover)',
          'accent-dim': 'var(--pdm-accent-dim)',
          'selection': 'var(--pdm-selection)',
          'highlight': 'var(--pdm-highlight)',
          // Status colors
          'success': 'var(--pdm-success)',
          'warning': 'var(--pdm-warning)',
          'error': 'var(--pdm-error)',
          'info': 'var(--pdm-info)',
          // File state colors
          'wip': 'var(--pdm-wip)',
          'released': 'var(--pdm-released)',
          'in-review': 'var(--pdm-in-review)',
          'obsolete': 'var(--pdm-obsolete)',
          'locked': 'var(--pdm-locked)',
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
        'spin-slow': 'spin 2s linear infinite',
        'pulse-subtle': 'pulse 3s ease-in-out infinite',
        'slide-in': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
