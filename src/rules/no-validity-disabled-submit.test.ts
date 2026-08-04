import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./no-validity-disabled-submit";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
    languageOptions: {
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
});

ruleTester.run("no-validity-disabled-submit", rule, {
    valid: [
        // The two legitimate reasons to disable: a request in flight, and a
        // missing permission. Both are self-explaining on screen.
        { code: "const a = <Button disabled={saving} />;" },
        { code: "const a = <Button disabled={busy || !canWrite} />;" },
        // The gate expresses the same rule the banned form did — but it refuses
        // the click instead of swallowing it.
        { code: "const a = <form.Submit gate={(v) => !!v.name} gateMessage={m} />;" },
        { code: "const o = {canSubmitWhenInvalid: true};" },
    ],
    invalid: [
        {
            code: "const a = <Button disabled={!canSubmit} />;",
            errors: [{ messageId: "disabledByValidity" }],
        },
        // Buried inside a bigger expression — the shape this actually ships as.
        {
            code: "const a = <Button disabled={saving || !canSubmit || !canWrite} />;",
            errors: [{ messageId: "disabledByValidity" }],
        },
        {
            code: "const a = <Button disabled={!form.state.isValid} />;",
            errors: [{ messageId: "disabledByValidity" }],
        },
        {
            code: "const o = {canSubmitWhenInvalid: false};",
            errors: [{ messageId: "canSubmitWhenInvalid" }],
        },
    ],
});
