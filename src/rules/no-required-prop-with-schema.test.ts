import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./no-required-prop-with-schema";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("no-required-prop-with-schema", rule, {
    valid: [
        // No schema — the prop IS the only authority, so it stays.
        {
            code: "function C() { const form = useAppForm({defaultValues: {}}); return <form.Input name='a' required />; }",
        },
        // Schema present, no prop: requiredness derived, nothing to drift.
        {
            code: "function C() { const form = useAppForm({validators: {onSubmit: S}}); return <form.Input name='a' />; }",
        },
        // A `required` on a plain component is not a form binding.
        {
            code: "function C() { const form = useAppForm({validators: {onSubmit: S}}); return <Input required />; }",
        },
    ],
    invalid: [
        {
            code: "function C() { const form = useAppForm({validators: {onSubmit: S}}); return <form.Input name='email' required />; }",
            errors: [{ messageId: "twoAuthorities", data: { field: "email" } }],
        },
        // Conditional schema: it governs create mode, so the prop is still a
        // second authority for that mode.
        {
            code: "function C() { const form = useAppForm({validators: isEdit ? undefined : {onSubmit: S}}); return <form.DatePicker name='dob' required={!isEdit} />; }",
            errors: [{ messageId: "twoAuthorities" }],
        },
    ],
});
