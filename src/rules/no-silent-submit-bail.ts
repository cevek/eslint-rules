import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * A submit that decides not to save must reject, not return.
 *
 * `useAppForm` treats a RESOLVED `onSubmit` as a commit that happened. The
 * wrapper is literally `await rawOnSubmit(args)` — the handler's return value is
 * discarded — and everything after that line runs unconditionally: the form
 * resets, the dirty guard is cleared, the success toast fires, `onSuccess` (the
 * close) runs. So a handler that returns because something was missing produces
 * the full successful path over a draft that was never sent — "Saved", panel
 * shut, guard down, work gone, and no way for the operator to tell.
 *
 * Because the value is discarded, `return;` is not special: `return null`,
 * `return false` and `return {skipped: true}` buy the identical false commit.
 * Only a return whose value is the AWAITED WORK is legitimate — `return
 * save(value)` hands the wrapper the promise it will await. So the rule flags
 * returns of a value it can see is not work (a literal, an object or array
 * literal, `null`, `undefined`, `void 0`) and stays quiet on calls, awaits and
 * bare identifiers, which may be exactly that promise.
 *
 * `throw ABORT_SUBMIT` from `@/lib/dirty-guard` is the bail said honestly: the
 * chain swallows it silently — no toast, no `onSuccess` — and the guard stays
 * armed, so the draft is still on screen and still protected. A bail that has
 * something to say to the operator throws its own error instead.
 *
 * The click-to-save half of the app has the same contract under another name:
 * `commitAndClose(cb)` clears the guard and closes when `cb` RESOLVES, so a bail
 * there buys the identical false commit on a panel that has no `<form>` at all.
 * Both mouths of the rule are covered; the name is only honoured in a file that
 * imports `useCommitAndClose`, so an unrelated local function of that name is
 * not policed.
 *
 * Scope is exact and narrow on purpose:
 *   - the `onSubmit` handed to `useAppForm`, and the callback handed to
 *     `commitAndClose`, written inline or as a same-file function named;
 *   - the handler's OWN body — a `return` inside a `forEach` / `map` callback
 *     nested in it belongs to that callback, and descent stops at the boundary;
 *   - returns in TAIL position only end the function, so they are exempt
 *     wherever they sit — including the last branch of a trailing `if`. Flagging
 *     those would prescribe `throw ABORT_SUBMIT` over work that already
 *     committed, which is the very defect this rule exists to prevent;
 *   - forms only: `wrap: false` opts out of the wrapper entirely, so there is no
 *     toast, no close and no guard reset to fake, and the rule stands down. An
 *     options object carrying a spread is not read at all — `wrap` may be inside
 *     it, and guessing would flag an opted-out form.
 *
 * A submit handler that lives in another module, or one wrapped in `useCallback`,
 * is out of reach, and this rule does not chase it — stated so the gap is known
 * rather than assumed away.
 */

/** `false as const` / `(false)` / `false satisfies boolean` — the value underneath. */
function unwrap(node: TSESTree.Node): TSESTree.Node {
    if (
        node.type === AST_NODE_TYPES.TSAsExpression ||
        node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
        node.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
        return unwrap(node.expression);
    }
    return node;
}

/**
 * A return the wrapper cannot tell from a completed save. Not "no argument" —
 * the argument is discarded either way, so anything that plainly is not the
 * awaited work counts.
 */
function isSilentBail(node: TSESTree.ReturnStatement): boolean {
    if (!node.argument) return true;
    const argument = unwrap(node.argument);
    switch (argument.type) {
        case AST_NODE_TYPES.Literal: // null, false, 0, ''
        case AST_NODE_TYPES.ObjectExpression:
        case AST_NODE_TYPES.ArrayExpression:
            return true;
        case AST_NODE_TYPES.Identifier:
            return argument.name === "undefined";
        case AST_NODE_TYPES.UnaryExpression:
            return argument.operator === "void";
        default:
            // A call, an await, a member read, a bare identifier: this may be the
            // promise the wrapper awaits. Not guessed at.
            return false;
    }
}

function isFunctionNode(node: TSESTree.Node): boolean {
    return (
        node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression
    );
}

/**
 * Every statement that ends the function: the last of the body, and — walking
 * down — the last of a trailing block, both branches of a trailing `if`, and the
 * tails of a trailing `try`. A return among them skips nothing.
 */
function collectTailStatements(body: TSESTree.BlockStatement, into: Set<TSESTree.Node>): void {
    const visitTail = (statement: TSESTree.Statement | null | undefined): void => {
        if (!statement) return;
        into.add(statement);
        if (statement.type === AST_NODE_TYPES.BlockStatement) {
            visitTail(statement.body[statement.body.length - 1]);
        } else if (statement.type === AST_NODE_TYPES.IfStatement) {
            visitTail(statement.consequent);
            visitTail(statement.alternate);
        } else if (statement.type === AST_NODE_TYPES.TryStatement) {
            visitTail(statement.finalizer ?? statement.block);
            visitTail(statement.handler?.body);
        }
    };
    visitTail(body.body[body.body.length - 1]);
}

export default createRule<[{ formHook: string; commitCallbacks: string[]; commitCallbackHook: string }], "silentBail">({
    name: "no-silent-submit-bail",
    meta: {
        type: "problem",
        docs: {
            description:
                "A submit that abandons the save must `throw ABORT_SUBMIT`, not return — the form reads any resolution as a commit.",
        },
        messages: {
            silentBail:
                "This `return` abandons the save, but the form reads a resolved submit as a commit — its return value is discarded, so success toast, `onSuccess` (the close) and the dirty-guard reset all run over a draft that was never sent. Bail with `throw ABORT_SUBMIT` from `@/lib/dirty-guard` (silent, guard stays armed, draft stays on screen), or throw an error the operator can act on.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    formHook: { type: "string" },
                    commitCallbacks: { type: "array", items: { type: "string" } },
                    commitCallbackHook: { type: "string" },
                },
                additionalProperties: false,
            },
        ],
    },
    defaultOptions: [
        { formHook: "useAppForm", commitCallbacks: ["commitAndClose"], commitCallbackHook: "useCommitAndClose" },
    ],
    create(context, [options]) {
        const { formHook, commitCallbacks, commitCallbackHook } = options;
        const sourceText = context.sourceCode.getText();
        const commitCallbacksInScope = sourceText.includes(commitCallbackHook);

        function reportBails(fn: TSESTree.Node): void {
            if (!isFunctionNode(fn)) return;
            const body = (fn as TSESTree.FunctionLike).body;
            if (!body || body.type !== AST_NODE_TYPES.BlockStatement) return;
            const tails = new Set<TSESTree.Node>();
            collectTailStatements(body, tails);

            const visit = (node: TSESTree.Node): void => {
                if (node !== fn && isFunctionNode(node)) return; // a nested callback's return is its own
                if (node.type === AST_NODE_TYPES.ReturnStatement) {
                    if (isSilentBail(node) && !tails.has(node)) {
                        context.report({ node, messageId: "silentBail" });
                    }
                    return;
                }
                for (const key of context.sourceCode.visitorKeys[node.type] ?? []) {
                    const child = (node as unknown as Record<string, unknown>)[key];
                    if (Array.isArray(child)) {
                        for (const item of child) {
                            if (item && typeof item === "object" && "type" in item) visit(item as TSESTree.Node);
                        }
                    } else if (child && typeof child === "object" && "type" in child) {
                        visit(child as TSESTree.Node);
                    }
                }
            };
            visit(body);
        }

        /** A same-file `const handleSubmit = …` / `function handleSubmit()` the name points at. */
        function resolveLocalFunction(name: TSESTree.Identifier): TSESTree.Node | null {
            const scope = context.sourceCode.getScope(name);
            for (let current: typeof scope | null = scope; current; current = current.upper) {
                const variable = current.variables.find((candidate) => candidate.name === name.name);
                if (!variable) continue;
                for (const definition of variable.defs) {
                    if (definition.node.type === AST_NODE_TYPES.FunctionDeclaration) return definition.node;
                    if (
                        definition.node.type === AST_NODE_TYPES.VariableDeclarator &&
                        definition.node.init &&
                        isFunctionNode(definition.node.init)
                    ) {
                        return definition.node.init;
                    }
                }
                return null;
            }
            return null;
        }

        function reportHandler(handler: TSESTree.Node): void {
            if (isFunctionNode(handler)) reportBails(handler);
            else if (handler.type === AST_NODE_TYPES.Identifier) {
                const resolved = resolveLocalFunction(handler);
                if (resolved) reportBails(resolved);
            }
        }

        return {
            CallExpression(node) {
                if (node.callee.type !== AST_NODE_TYPES.Identifier) return;

                // `commitAndClose(cb)` — clears the guard and closes when `cb` resolves.
                if (commitCallbacks.includes(node.callee.name)) {
                    if (commitCallbacksInScope && node.arguments[0]) reportHandler(node.arguments[0]);
                    return;
                }

                if (node.callee.name !== formHook) return;
                const arg = node.arguments[0];
                if (arg?.type !== AST_NODE_TYPES.ObjectExpression) return;
                // A spread may carry `wrap: false`; reading the rest would police a
                // form that opted out.
                if (arg.properties.some((prop) => prop.type === AST_NODE_TYPES.SpreadElement)) return;

                let onSubmit: TSESTree.Node | null = null;
                let wrapped = true;
                for (const prop of arg.properties) {
                    if (prop.type !== AST_NODE_TYPES.Property) continue;
                    if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;
                    if (prop.key.name === "onSubmit") onSubmit = prop.value;
                    if (prop.key.name === "wrap") {
                        const value = unwrap(prop.value as TSESTree.Node);
                        if (value.type === AST_NODE_TYPES.Literal) wrapped = value.value !== false;
                    }
                }
                if (onSubmit && wrapped) reportHandler(onSubmit);
            },
        };
    },
});
