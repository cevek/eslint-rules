import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * A hook reached through an object (`form.useRequired()`, `form.useFieldValue()`)
 * must be called at the TOP LEVEL of a component body, like any other hook.
 *
 * This exists because `rules-of-hooks` cannot see these calls at all: it
 * recognises a hook by its callee being an identifier named `useX`, and
 * `form.useX(...)` is a member expression. The failure is not theoretical —
 * `<Label required={form.useRequired('time')}>` inside a `{visitType ? … : null}`
 * branch changed the hook count the moment a visit type was picked, and React
 * tore the whole booking dialog down with "Rendered more hooks than during the
 * previous render". Every guard in the repo was green.
 *
 * What is flagged: a `*.use*()` call whose nearest enclosing function is not the
 * component/hook itself — i.e. it sits inside a conditional expression, a `&&`,
 * a loop, a callback (`map`, a render-prop, an event handler) or a nested
 * arrow — plus the same call in a plain `if` / loop statement body.
 *
 * What is NOT flagged: a call in the component's own statement list, however
 * deeply nested in destructuring or object literals, since that runs exactly
 * once per render.
 */

type Options = [{ objectNames: string[] }];

const DEFAULTS: Options[0] = { objectNames: ["form", "draft"] };

function isHookMemberCall(node: TSESTree.CallExpression, objectNames: string[]): boolean {
    const callee = node.callee;
    if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;
    if (callee.computed || callee.property.type !== AST_NODE_TYPES.Identifier) return false;
    if (!/^use[A-Z]/.test(callee.property.name)) return false;
    // `form.useX()`, `draft.form.useX()`, `props.form.useX()` — the root of the
    // member chain is what names the owner.
    let root: TSESTree.Node = callee.object;
    while (root.type === AST_NODE_TYPES.MemberExpression) root = root.object;
    if (root.type !== AST_NODE_TYPES.Identifier) return false;
    if (callee.object.type === AST_NODE_TYPES.Identifier) {
        return objectNames.includes(callee.object.name) || /[Ff]orm$/.test(callee.object.name);
    }
    return objectNames.includes(root.name) || /[Ff]orm$/.test(root.name);
}

/** The function whose body this node runs in, or `null` at module scope. */
function enclosingFunction(node: TSESTree.Node): TSESTree.Node | null {
    let current: TSESTree.Node | undefined = node.parent;
    while (current) {
        if (
            current.type === AST_NODE_TYPES.FunctionDeclaration ||
            current.type === AST_NODE_TYPES.FunctionExpression ||
            current.type === AST_NODE_TYPES.ArrowFunctionExpression
        ) {
            return current;
        }
        current = current.parent;
    }
    return null;
}

/**
 * True when the call runs conditionally INSIDE its own function: a ternary, a
 * logical operator's right side, or a branch/loop statement body.
 */
function isConditionallyReached(node: TSESTree.Node, fn: TSESTree.Node | null): boolean {
    let child: TSESTree.Node = node;
    let current: TSESTree.Node | undefined = node.parent;
    while (current && current !== fn) {
        switch (current.type) {
            // Only the branches. `form.useX() || 0` and `cond ? a : b`'s TEST
            // both run every render — flagging them would be noise, and noise is
            // how a rule gets turned off.
            case AST_NODE_TYPES.ConditionalExpression:
                if (current.test !== child) return true;
                break;
            case AST_NODE_TYPES.LogicalExpression:
                if (current.left !== child) return true;
                break;
            case AST_NODE_TYPES.IfStatement:
            case AST_NODE_TYPES.ForStatement:
            case AST_NODE_TYPES.ForInStatement:
            case AST_NODE_TYPES.ForOfStatement:
            case AST_NODE_TYPES.WhileStatement:
            case AST_NODE_TYPES.DoWhileStatement:
            case AST_NODE_TYPES.SwitchCase:
                return true;
            default:
                break;
        }
        child = current;
        current = current.parent;
    }
    return false;
}

/** A component or hook — the only place a hook may be called. */
function isComponentOrHook(fn: TSESTree.Node | null): boolean {
    if (!fn) return false;
    if (fn.type === AST_NODE_TYPES.FunctionDeclaration && fn.id) {
        return /^(use[A-Z]|[A-Z])/.test(fn.id.name);
    }
    const parent = fn.parent;
    if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
        return /^(use[A-Z]|[A-Z])/.test(parent.id.name);
    }
    if (
        (fn.type === AST_NODE_TYPES.FunctionExpression || fn.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
        parent?.type === AST_NODE_TYPES.CallExpression
    ) {
        // ONLY the component wrappers. Any call would do here — and `keys.map(k
        // => …)` is a call, which is the very case this rule exists for.
        const wrapper = parent.callee;
        const name =
            wrapper.type === AST_NODE_TYPES.Identifier
                ? wrapper.name
                : wrapper.type === AST_NODE_TYPES.MemberExpression &&
                    wrapper.property.type === AST_NODE_TYPES.Identifier
                  ? wrapper.property.name
                  : "";
        return ["memo", "forwardRef", "observer"].includes(name);
    }
    return false;
}

export default createRule<Options, "nestedFormHook">({
    name: "no-nested-form-hook",
    meta: {
        type: "problem",
        docs: {
            description:
                "A form's `use*` member call is a hook: require it at the top level of the component, where rules-of-hooks cannot see it.",
        },
        messages: {
            nestedFormHook:
                "`{{call}}` is a HOOK reached through an object, so `rules-of-hooks` does not see it — but React still counts it. Call it once at the top of the component and use the result here; a conditional branch changes the hook count between renders and tears the tree down.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    objectNames: { type: "array", items: { type: "string" } },
                },
                additionalProperties: false,
            },
        ],
    },
    defaultOptions: [DEFAULTS],
    create(context, [options]) {
        const objectNames = options?.objectNames ?? DEFAULTS.objectNames;
        return {
            CallExpression(node) {
                if (!isHookMemberCall(node, objectNames)) return;
                const fn = enclosingFunction(node);
                const callee = node.callee as TSESTree.MemberExpression;
                const name =
                    callee.property.type === AST_NODE_TYPES.Identifier ? callee.property.name : "use…";
                // Inside a callback / render-prop / nested arrow: the enclosing
                // function is not the component, so the call is not once-per-render.
                if (!isComponentOrHook(fn) || isConditionallyReached(node, fn)) {
                    context.report({ node, messageId: "nestedFormHook", data: { call: `…${name}()` } });
                }
            },
        };
    },
});
