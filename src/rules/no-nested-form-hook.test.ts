import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./no-nested-form-hook";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("no-nested-form-hook", rule, {
    valid: [
        // Once per render, at the top of the component — the only correct shape.
        { code: "function Fields({form}) { const required = form.useRequired(); return <Label required={required('a')} />; }" },
        { code: "function Fields({form}) { const v = form.useFieldValue('a'); return <b>{v}</b>; }" },
        // Inside a custom hook, same rule.
        { code: "function useDraft(form) { const v = form.useFieldValue('a'); return v; }" },
        // Destructured / nested in an object literal but still once per render.
        { code: "function Fields({form}) { const req = {a: form.useFieldValue('a')}; return <b>{req.a}</b>; }" },
        // Not a hook: no `use` prefix.
        { code: "function Fields({form}) { return <b>{cond ? form.getValue('a') : null}</b>; }" },
        // Not a form: the rule is about form-shaped owners, not every object.
        { code: "function Fields({api}) { return <b>{cond ? api.useThing() : null}</b>; }" },
        { code: "const Fields = memo(({form}) => { const v = form.useFieldValue('a'); return <b>{v}</b>; });" },
        // Runs every render: the left of `||` and the test of a ternary are not
        // branches. Flagging these is the noise that gets a rule disabled.
        { code: "function Fields({form}) { const n = Number(form.useFieldValue('vat')) || 0; return <b>{n}</b>; }" },
        { code: "function Fields({form}) { const n = form.useFieldValue('a') ? 1 : 2; return <b>{n}</b>; }" },
    ],
    invalid: [
        // The exact shape that white-screened the booking dialog.
        {
            code: "function Fields({form}) { return <div>{visitType ? <Label required={form.useRequired('time')} /> : null}</div>; }",
            errors: [{ messageId: "nestedFormHook" }],
        },
        // `&&` is the same conditional, spelled shorter.
        {
            code: "function Fields({form}) { return <div>{visitType && <Label required={form.useRequired('time')} />}</div>; }",
            errors: [{ messageId: "nestedFormHook" }],
        },
        // A render-prop callback runs a variable number of times.
        {
            code: "function Fields({form}) { return <List>{(item) => <Label required={form.useRequired(item.key)} />}</List>; }",
            errors: [{ messageId: "nestedFormHook" }],
        },
        // A map over data: the count follows the data.
        {
            code: "function Fields({form, keys}) { return <div>{keys.map((k) => <Label required={form.useRequired(k)} />)}</div>; }",
            errors: [{ messageId: "nestedFormHook" }],
        },
        // A statement-level branch inside the component body.
        {
            code: "function Fields({form}) { if (cond) { const v = form.useFieldValue('a'); return <b>{v}</b>; } return null; }",
            errors: [{ messageId: "nestedFormHook" }],
        },
        // An event handler is not render at all.
        {
            code: "function Fields({form}) { return <button onClick={() => form.useFieldValue('a')} />; }",
            errors: [{ messageId: "nestedFormHook" }],
        },
        // A chained owner (`draft.form`) is the same hook.
        {
            code: "function View({draft}) { return <div>{cond ? <b>{draft.form.useFieldValue('a')}</b> : null}</div>; }",
            errors: [{ messageId: "nestedFormHook" }],
        },
        // Outside a component entirely.
        {
            code: "const value = someForm.useFieldValue('a');",
            errors: [{ messageId: "nestedFormHook" }],
        },
    ],
});
