// @ts-check

const config = {
  // For TypeScript files:
  // 1. Lint and fix TypeScript code using ESLint, ensuring no warnings and leveraging the cache for better performance.
  // 2. Format TypeScript files with Prettier for consistent code style.
  '**/*.ts': ['eslint --max-warnings 0 --no-warn-ignored --fix', 'prettier --write'],

  // For JavaScript files:
  // 1. Lint and fix JavaScript code using ESLint with the same settings as TypeScript (no warnings, caching enabled).
  // 2. Format JavaScript files with Prettier after linting to ensure consistent style.
  '**/*.{js,mjs,cjs}': ['eslint --max-warnings 0 --no-warn-ignored --fix', 'prettier --write'],

  // For all other file types (excluding CSS, TypeScript, and JavaScript):
  // Format using Prettier, but ignore unsupported or unknown file types.
  '!(*.ts?|*.{js,mjs,cjs})': 'prettier --write --ignore-unknown'
}

export default config
