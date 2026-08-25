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

  // When anything that feeds the bundle is staged, rebuild dist/ and stage it
  // alongside. Returning a function keeps lint-staged from appending filenames --
  // ncc builds the whole entry point, not individual files.
  //
  // This makes the local build the normal path and leaves commit-dist.yml as the
  // safety net for PRs that cannot run hooks (forks, Dependabot). See
  // docs/adr/0004-build-dist-locally.md.
  '{src/**/*.ts,pnpm-lock.yaml,package.json}': () => ['pnpm build', 'git add dist'],

  // For all other file types (excluding CSS, TypeScript, and JavaScript):
  // Format using Prettier, but ignore unsupported or unknown file types.
  '!(*.ts?|*.{js,mjs,cjs})': 'prettier --write --ignore-unknown'
}

export default config
