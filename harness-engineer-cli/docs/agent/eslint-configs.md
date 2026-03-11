# ESLint Config Templates

Use ESLint flat config format (`eslint.config.js`) for all projects.
Select the template matching the project's framework.

---

## Base TypeScript (no framework)

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
      }],
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
      }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
  {
    ignores: ['dist/', 'build/', 'node_modules/', '*.config.js', '*.config.ts'],
  },
);
```

**Dependencies:**
```json
{
  "@eslint/js": "^9.0.0",
  "typescript-eslint": "^8.0.0",
  "eslint": "^9.0.0"
}
```

---

## Next.js

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    plugins: {
      '@next/next': nextPlugin,
      'react': reactPlugin,
      'react-hooks': hooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactPlugin.configs.recommended.rules,
      ...hooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
      }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    ignores: ['.next/', 'out/', 'node_modules/', 'next.config.*'],
  },
);
```

**Additional dependencies:**
```json
{
  "@next/eslint-plugin-next": "^15.0.0",
  "eslint-plugin-react": "^7.37.0",
  "eslint-plugin-react-hooks": "^5.0.0"
}
```

---

## React (Vite)

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import refreshPlugin from 'eslint-plugin-react-refresh';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    plugins: {
      'react': reactPlugin,
      'react-hooks': hooksPlugin,
      'react-refresh': refreshPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...hooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
      }],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
      }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
  },
);
```

---

## Node.js API (Express / Fastify / Hono)

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    plugins: {
      'import': importPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
      }],
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
      }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      // Enforce dependency layer order
      'import/no-restricted-paths': ['error', {
        zones: [
          // UI cannot import from Service
          // Service cannot import from Controller
          // Customize based on ARCHITECTURE.md layers
        ],
      }],
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      }],
    },
  },
  {
    ignores: ['dist/', 'build/', 'node_modules/'],
  },
);
```

**Additional dependencies:**
```json
{
  "eslint-plugin-import": "^2.31.0"
}
```

---

## Assembly Rules

1. Pick the template matching the chosen framework
2. Adjust `import/no-restricted-paths` zones to match ARCHITECTURE.md dependency layers
3. All templates use `strictTypeChecked` — do NOT downgrade to `recommended`
4. `no-explicit-any` is always `error` — never `warn`, never `off`
5. Unused vars with `_` prefix are allowed (common pattern for intentional ignores)
6. `consistent-type-imports` enforces `import type` — keeps bundles clean
7. Add framework-specific plugins as needed, but never remove base TypeScript rules
