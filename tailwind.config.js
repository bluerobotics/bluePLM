/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'plm': {
          // Theme-aware colors using CSS variables
          'bg': 'var(--plm-bg)',
          'bg-light': 'var(--plm-bg-light)',
          'bg-lighter': 'var(--plm-bg-lighter)',
          'bg-secondary': 'var(--plm-bg-secondary)',
          'sidebar': 'var(--plm-sidebar)',
          'activitybar': 'var(--plm-activitybar)',
          'panel': 'var(--plm-panel)',
          'input': 'var(--plm-input)',
          'border': 'var(--plm-border)',
          'border-light': 'var(--plm-border-light)',
          'fg': 'var(--plm-fg)',
          'fg-dim': 'var(--plm-fg-dim)',
          'fg-muted': 'var(--plm-fg-muted)',
          'accent': 'var(--plm-accent)',
          'accent-hover': 'var(--plm-accent-hover)',
          'accent-dim': 'var(--plm-accent-dim)',
          'selection': 'var(--plm-selection)',
          'highlight': 'var(--plm-highlight)',
          // Status colors
          'success': 'var(--plm-success)',
          'warning': 'var(--plm-warning)',
          'error': 'var(--plm-error)',
          'info': 'var(--plm-info)',
          // File state colors
          'wip': 'var(--plm-wip)',
          'released': 'var(--plm-released)',
          'in-review': 'var(--plm-in-review)',
          'obsolete': 'var(--plm-obsolete)',
          'locked': 'var(--plm-locked)',
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
      },
    },
  },
  plugins: [],
}
