/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary:   '#1B4F72',
        secondary: '#2E86C1',
        accent:    '#F39C12',
        success:   '#27AE60',
        danger:    '#E74C3C',
        surface:   '#F8F9FA',
      },
    },
  },
  plugins: [],
}
