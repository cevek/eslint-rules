import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./no-unbound-field-control";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("no-unbound-field-control", rule, {
    valid: [
        // A bound primitive outside any form file — a filter, a search box.
        { code: "const a = <Input field={f} />;" },
        // The sanctioned path: the binding renders the primitive and its error.
        {
            code: "function C() { const form = useAppForm({}); return <form.Input name='a' />; }",
        },
        // Presentational usage inside a form file: no field, no error to lose.
        {
            code: "function C() { const form = useAppForm({}); return <Input value={q} onChange={setQ} />; }",
        },
        // Hand-rendered, but the author wrapped it in the slot — same guarantee.
        {
            code: "function C() { const form = useAppForm({}); return <form.Field name='a'>{(f) => <FieldSlot field={f}>{(d) => <Input field={f} aria-describedby={d} />}</FieldSlot>}</form.Field>; }",
        },
    ],
    invalid: [
        {
            code: "function C() { const form = useAppForm({}); return <Input field={f} />; }",
            errors: [{ messageId: "unbound" }],
        },
        // A render-prop callsite that drew no slot — the hole this closes.
        {
            code: "function C() { const form = useAppForm({}); return <form.Field name='a'>{(f) => <Input field={f} />}</form.Field>; }",
            errors: [{ messageId: "unbound" }],
        },
        {
            code: "function C() { const form = useAppForm({}); return <><Textarea field={a} /><Select field={b} /></>; }",
            errors: [{ messageId: "unbound" }, { messageId: "unbound" }],
        },
    ],
});
