// Intentionally empty: this app uses plain CSS, no PostCSS plugins.
//
// Without this file, PostCSS config discovery walks up and finds the kiosk's
// postcss.config.mjs at the repo root, which declares @tailwindcss/postcss —
// a package that is not, and should not be, a dependency here.
const config = { plugins: {} };

export default config;
