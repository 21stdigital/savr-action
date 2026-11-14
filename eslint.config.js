import eslint from '@eslint/js'
import { importX } from 'eslint-plugin-import-x'
import pluginPreferArrowFunctions from 'eslint-plugin-prefer-arrow-functions'
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/coverage', 'docs'] },
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
      'import-x': importX
    }
  },
  {
    plugins: {
      'simple-import-sort': pluginSimpleImportSort
    },
    rules: {
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-duplicates': 'error',
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
