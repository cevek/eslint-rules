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
| `no-handrolled-form`       | any component file               | a component that owns field state + renders a controlled field + persists it (mutation / submit) without the sanctioned form hook — i.e. a hand-rolled form. Fully name-configurable (see options). |

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

### `no-handrolled-form` messages

- `handrolled` — component fires all three signals (owns field state + controlled field + persist) without the form hook

A file is flagged only when **all** hold and the form hook is **absent**:

1. **owns field state** — calls a hook in `stateHooks` (`useState`/`useReducer`)
2. **controlled field** — renders a `fieldComponents` element carrying both a `valueProps` prop and a `changeProps` prop
3. **persists** — calls `mutateCallees` (`mutate`/`mutateAsync`, incl. `x.mutate()`), or a hook matching `persistHookPattern`, or a `formElements` element with `onSubmit`, or a `submitComponents` element with `type="submit"`

This naturally exempts controlled sub-editors (value+onChange via props, no persist) and search inputs (query, not mutation).

#### Options

All matching is name-based and configurable, so the rule ports across projects. Omitted keys fall back to defaults.

| Option | Default | Meaning |
| --- | --- | --- |
| `formHook` | `"useForm"` | sanctioned form hook; its presence in a file exempts the file |
| `fieldComponents` | `input, textarea, select` (native elements) | JSX names treated as controlled fields; projects hiding fields behind primitives (`<Input>`, …) pass their own list |
| `valueProps` | `value, checked, selected` | props marking a field value-controlled |
| `changeProps` | `onChange, onValueChange, onCheckedChange` | props marking a field change-handled |
| `stateHooks` | `useState, useReducer` | hooks counting as "owns field state" |
| `mutateCallees` | `mutate, mutateAsync` | callee names (identifier or `.member`) counting as persist |
| `persistHookPattern` | `^use\\w*Mutation$` | regex (source string) for persist hook names (`useMutation`, `useCreateUserMutation`, …) |
| `formElements` | `["form"]` | elements whose `onSubmit` counts as persist |
| `submitComponents` | `["Button", "button"]` | elements counting as persist when `type="submit"` |
| `exemptPaths` | `[]` | regex source strings matched against the filename; a match skips the file |

```js
// e.g. a project using react-hook-form + MUI
'@cevek/no-handrolled-form': ['error', {
    formHook: 'useForm',
    fieldComponents: ['TextField', 'Checkbox', 'Switch', 'Autocomplete'],
    persistHookPattern: '^use\\w+Mutation$',
    exemptPaths: ['[\\\\/]ui[\\\\/]', '[\\\\/]lib[\\\\/]'],
}],
```

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
            '@cevek/no-handrolled-form': 'error',
        },
    },
];
```
