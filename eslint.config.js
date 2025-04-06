import eslint from '@eslint/js'
import pluginImport from 'eslint-plugin-import'
import pluginPreferArrowFunctions from 'eslint-plugin-prefer-arrow-functions'
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/coverage'] },
  eslint.configs.recommended,
  {
    files: ['**/*.js'],
    rules: {
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        // projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked
  },
  {
    plugins: {
      import: pluginImport
    }
  },
  {
    plugins: {
      'simple-import-sort': pluginSimpleImportSort
    },
    rules: {
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error'
    }
  },
  {
    plugins: {
      'prefer-arrow-functions': pluginPreferArrowFunctions
    },
    rules: {
      'prefer-arrow-functions/prefer-arrow-functions': 'error'
    }
  }
)
