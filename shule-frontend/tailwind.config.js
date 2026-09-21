/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Kaiadmin palette
        primary:   '#177dff',
        secondary: '#36a3f7',
        purple:    '#716aca',
        accent:    '#ffa534',
        success:   '#35cd3a',
        danger:    '#f3545d',
        surface:   '#f9fbfd',
        sidebar:   '#1a2035',
        ink:       '#2a2f5b',
      },
      fontFamily: {
        sans: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 15px 1px rgba(69, 65, 78, 0.08)',
      },
    },
  },
  plugins: [],
}
