# @cevek/eslint-plugin

Custom ESLint rules. Config namespace: `@cevek`.

## Rules

| Rule                       | Applies to                       | Reports                                                                                                                                                                     |
| -------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component-file-structure` | `*.tsx` with PascalCase filename | one component per file matching filename; no top-level helpers or hooks (allowed: imports, re-exports, `enum`, `type`/`interface`, `lazy(() => import(...))`, curried HOCs) |
| `component-scss-module`    | `*.tsx` with PascalCase filename | at most one `.module.scss` import; basename must be `<Component>.module.scss`; relative paths must be sibling (`./<Component>.module.scss`); plain `.scss` imports are not checked |
| `lucide-icon-size-prop`    | any JSX                          | JSX elements imported from `lucide-react` without a `size` prop (spread `{...props}` skips the check)                                                                       |
| `no-static-inline-style`   | any JSX                          | `<div style={{...}}/>` on a lowercase DOM element where every property value is a literal (nested static objects included)                                                  |
| `no-template-literal-classname` | any JSX                     | template literal inside `className={...}` — use `cn()` from `@/lib/utils` instead                                                                                           |

### `component-file-structure` messages

- `nameMismatch` — single component in file, name ≠ filename
- `extraComponent` — more than one component in file
- `noHelpers` — top-level helper function (camelCase, not a hook)
- `noHooks` — top-level `use*` hook

### `component-scss-module` messages

- `scssMismatch` — `.module.scss` import basename ≠ `<Component>.module.scss`, or relative path is not strict sibling
- `multipleScss` — more than one `.module.scss` import in the file

### `lucide-icon-size-prop` messages

- `missingSize` — `lucide-react` icon used without a `size` prop

### `no-static-inline-style` messages

- `noStaticStyle`

### `no-template-literal-classname` messages

- `useCn` — template literal used inside `className={...}`

## Flat config (ESLint 10+)

```js
import cevek from '@cevek/eslint-plugin';

export default [
    {
        files: ['**/*.{ts,tsx}'],
        plugins: {'@cevek': cevek},
        rules: {
            '@cevek/component-file-structure': 'error',
            '@cevek/component-scss-module': 'error',
            '@cevek/lucide-icon-size-prop': 'error',
            '@cevek/no-static-inline-style': 'warn',
            '@cevek/no-template-literal-classname': 'error',
        },
    },
];
```
