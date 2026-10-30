const path = require('path')
const base = require('../tailwind.config.js')

// Same theme tokens as the desktop app; only the scanned sources differ.
/** @type {import('tailwindcss').Config} */
module.exports = {
  ...base,
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{ts,tsx}')],
}
