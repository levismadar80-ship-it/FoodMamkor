// Build-only Tailwind config for design-sync. Extends the repo config, adds the
// authored-preview dir to content so preview-only utility classes are generated.
const base = require('../tailwind.config.js');
module.exports = {
  ...base,
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    '../.design-sync/previews/**/*.{tsx,jsx}',
  ],
};
