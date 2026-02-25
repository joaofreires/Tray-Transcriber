module.exports = {
  plugins: [
    // Tailwind CSS v4 now ships its PostCSS plugin in a separate
    // package. the error from the dev server indicated we must use it.
    require('@tailwindcss/postcss')(),
    require('autoprefixer')()
  ]
};

