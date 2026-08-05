import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./no-silent-submit-bail";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run("no-silent-submit-bail", rule, {
    valid: [
        // The correct bail, as written across ~20 sites in the repo: rejects, so
        // the chain swallows it — no toast, no close, guard stays armed.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            if (!value.file) throw ABORT_SUBMIT;
                            await upload(value.file);
                        },
                    });
                }
            `,
        },
        // A return inside a NESTED callback belongs to that callback — it skips one
        // item, it does not abandon the save. This is the case a rule that forgets
        // to stop at function boundaries gets wrong, and the repo is full of them.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            value.rows.forEach((row) => {
                                if (!row.dirty) return;
                                queue.push(row);
                            });
                            await save(queue);
                        },
                    });
                }
            `,
        },
        // `wrap: false` opts out of the wrapper entirely: no success toast, no
        // `onSuccess`, no guard reset, so there is no false commit to produce.
        {
            code: `
                function Body() {
                    return useAppForm({
                        wrap: false,
                        onSubmit: async ({value}) => {
                            if (!value.id) return;
                            await save(value);
                        },
                    });
                }
            `,
        },
        // Returning the awaited WORK is legitimate — the wrapper gets the promise
        // it will await, and the commit really happens.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            if (value.direct) return save(value);
                            return saveIndirect(value);
                        },
                    });
                }
            `,
        },
        // A bare return in TAIL position of a trailing branch ends the function and
        // skips nothing — the save above it already committed. Flagging it would
        // prescribe `throw ABORT_SUBMIT` over saved work, i.e. the very defect the
        // rule exists to prevent.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            await save(value);
                            if (value.extra) {
                                await saveExtra(value.extra);
                                return;
                            }
                        },
                    });
                }
            `,
        },
        // `wrap: false as const` is the same opt-out with a type assertion on it.
        {
            code: `
                function Body() {
                    return useAppForm({
                        wrap: false as const,
                        onSubmit: async ({value}) => {
                            if (!value.id) return;
                            await save(value);
                        },
                    });
                }
            `,
        },
        // A local function that merely shares the name, in a file with no
        // `useCommitAndClose` — not the guard contract, not policed.
        {
            code: `
                function unrelated(commitAndClose) {
                    commitAndClose(async () => {
                        if (!ready) return;
                        await go();
                    });
                }
            `,
        },
        // `validators: {onSubmit: schema}` is a schema, not a handler — 36 forms in
        // the repo pass one, and confusing the two would make the rule nonsense.
        {
            code: `
                function Body() {
                    return useAppForm({
                        validators: {onSubmit: schema},
                        onSubmit: async ({value}) => {
                            await save(value);
                        },
                    });
                }
            `,
        },
        // A trailing bare return is dead weight, not a bail — nothing follows it to
        // be skipped.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            await save(value);
                            return;
                        },
                    });
                }
            `,
        },
    ],
    invalid: [
        // The defect itself: "Saved", panel shut, guard down, nothing sent.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            if (!value.template) return;
                            await send(value);
                        },
                    });
                }
            `,
            errors: [{ messageId: "silentBail" }],
        },
        // The wrapper is `await rawOnSubmit(args)` — the return VALUE is discarded,
        // so a returned object is exactly as much a false commit as a bare return.
        // This case was written the other way round first; `form.tsx:466` settles it.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            if (value.skip) return {skipped: true};
                            return save(value);
                        },
                    });
                }
            `,
            errors: [{ messageId: "silentBail" }],
        },
        // Same, spelled `null` — and `void 0`, which reads as deliberate.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            if (!value.a) return null;
                            if (!value.b) return void 0;
                            await save(value);
                        },
                    });
                }
            `,
            errors: [{ messageId: "silentBail" }, { messageId: "silentBail" }],
        },
        // `return undefined;` is the same bail spelled longer.
        {
            code: `
                function Body() {
                    return useAppForm({
                        onSubmit: async ({value}) => {
                            if (!value.id) return undefined;
                            await save(value);
                        },
                    });
                }
            `,
            errors: [{ messageId: "silentBail" }],
        },
        // Same contract under the click-to-save name: `commitAndClose` clears the
        // guard and closes when its callback RESOLVES, so a bare return there buys
        // the identical false commit on a panel that has no `<form>` at all.
        {
            code: `
                import {useCommitAndClose} from '@/lib/dirty-guard';
                function Panel() {
                    const commitAndClose = useCommitAndClose();
                    const save = () =>
                        commitAndClose(async () => {
                            if (!draft.title) return;
                            await mutate(draft);
                        });
                    return save;
                }
            `,
            errors: [{ messageId: "silentBail" }],
        },
        // The handler named rather than inlined, resolved within the file.
        {
            code: `
                function Body() {
                    const handleSubmit = async ({value}) => {
                        if (!value.id) return;
                        await save(value);
                    };
                    return useAppForm({onSubmit: handleSubmit});
                }
            `,
            errors: [{ messageId: "silentBail" }],
        },
    ],
});
