// Tailwind build settings. Rebuild the stylesheet after changing any page or script:
//   npm install   (once)
//   npm run build:css
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './frontend/scripts/*.js'],
  theme: {
    extend: {
      colors: {
        'sams-blue': '#002654',
        'sams-gold': '#FFB81C',
        'sams-light-blue': '#0072CE',
      },
      fontFamily: {
        sans: ['Open Sans', 'sans-serif'],
        heading: ['Montserrat', 'sans-serif'],
        script: ['Brush Script MT', 'cursive'],
      },
    },
  },
  plugins: [],
};
