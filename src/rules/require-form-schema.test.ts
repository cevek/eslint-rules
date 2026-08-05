import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./require-form-schema";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.itOnly = it.only;
RuleTester.it = it;

const ruleTester = new RuleTester({
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("require-form-schema", rule, {
    valid: [
        // The ordinary case: requiredness is declared where the fields can read it.
        { code: "const form = useAppForm({defaultValues: {}, validators: {onSubmit: S}});" },
        // Opt-out with a real reason, directly above the call.
        {
            code: "// @no-schema: this draft cannot refuse anything — an empty roster saves fine\nconst form = useAppForm({defaultValues: {}});",
        },
        // A story mounts forms as fixtures; excluded by construction, not by 14 markers.
        {
            code: "const form = useAppForm({defaultValues: {}});",
            filename: "/x/Thing.story.tsx",
        },
        // Not the form hook at all.
        { code: "const x = useSomethingElse({defaultValues: {}});" },
    ],
    invalid: [
        // The default state this rule exists to make loud.
        {
            code: "const form = useAppForm({defaultValues: {}});",
            errors: [{ messageId: "missingSchema" }],
        },
        // A marker with nothing after it is the same silent default, in a comment.
        {
            code: "// @no-schema:\nconst form = useAppForm({defaultValues: {}});",
            errors: [{ messageId: "unexplainedOptOut" }],
        },
        // ...and so is a shrug.
        {
            code: "// @no-schema: n/a\nconst form = useAppForm({defaultValues: {}});",
            errors: [{ messageId: "unexplainedOptOut" }],
        },
        // The reason has to be ABOVE THIS CALL. A marker elsewhere in the file
        // would waive a form its author never read.
        {
            code: "// @no-schema: the other form in this file has nothing to refuse\nconst a = useAppForm({validators: {onSubmit: S}});\nconst b = useAppForm({defaultValues: {}});",
            errors: [{ messageId: "missingSchema" }],
        },
    ],
});
