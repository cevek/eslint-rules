import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./no-prefilled-required-default";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

const schema = "const schema = z.object({time: z.string().min(1), notes: z.string()});";

ruleTester.run("no-prefilled-required-default", rule, {
    valid: [
        // Empty is the point: the rule can fail, so the operator is asked.
        { code: `${schema} const f = useAppForm({defaultValues: {time: ''}, validators: {onSubmit: schema}});` },
        // From the edited record / a prop / a call — data, not a guess.
        { code: `${schema} const f = useAppForm({defaultValues: {time: initial?.time ?? ''}});` },
        { code: `${schema} const f = useAppForm({defaultValues: {time: props.time}});` },
        { code: `${schema} const f = useAppForm({defaultValues: {time: format(slot, 'HH:mm')}});` },
        // Not required by the schema: a literal default is a legitimate choice.
        { code: `${schema} const f = useAppForm({defaultValues: {notes: 'draft'}});` },
        // No schema in sight — the rule does not guess.
        { code: "const f = useAppForm({defaultValues: {time: '09:00'}});" },
    ],
    invalid: [
        // The booking defect, exactly.
        {
            code: `${schema} const f = useAppForm({defaultValues: {time: initial?.time ?? '09:00'}});`,
            errors: [{ messageId: "prefilledRequired" }],
        },
        // A bare literal is the same thing, spelled shorter.
        {
            code: `${schema} const f = useAppForm({defaultValues: {time: '09:00'}});`,
            errors: [{ messageId: "prefilledRequired" }],
        },
        // Buried in a ternary — one branch is still a guess.
        {
            code: `${schema} const f = useAppForm({defaultValues: {time: slot ? format(slot) : '09:00'}});`,
            errors: [{ messageId: "prefilledRequired" }],
        },
        // Requiredness written as a superRefine rather than `min(1)`.
        {
            code: "const s = z.custom().superRefine((value, ctx) => { if (!value.time.trim()) issueOn(ctx, 'time'); }); const f = useAppForm({defaultValues: {time: '09:00'}});",
            errors: [{ messageId: "prefilledRequired" }],
        },
    ],
});
