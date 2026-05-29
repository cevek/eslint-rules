import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * Forbid hand-rolled forms. Every form must go through a sanctioned form hook
 * (default `useAppForm`) instead of manual `useState` + `onChange` + submit.
 *
 * The smell: a component that simultaneously
 *   1. owns field state           — a state hook (useState / useReducer)
 *   2. renders a controlled field — a field component with a value-prop + a change-prop
 *   3. persists it                — calls a mutation / has <form onSubmit> / a submit button
 * …without calling the form hook.
 *
 * Legal controlled sub-editors receive value+onChange as PROPS and never call a
 * mutation, so the persist gate (3) exempts them. Search/filter inputs run on a
 * query (not a mutation), so they are exempt too.
 *
 * Everything name-based is configurable via options so the rule is portable
 * across projects (different form hook, field primitives, mutation naming…).
 */

type Options = [
    {
        formHook: string;
        fieldComponents: string[];
        valueProps: string[];
        changeProps: string[];
        stateHooks: string[];
        mutateCallees: string[];
        persistHookPattern: string;
        formElements: string[];
        submitComponents: string[];
        exemptPaths: string[];
    },
];

const DEFAULTS: Options[0] = {
    // Universal default: the common react-hook-form / TanStack Form entry hook.
    // Projects with a wrapper hook (e.g. `useAppForm`) override this.
    formHook: "useForm",
    // Universal default: native HTML form elements. Projects that hide these
    // behind component primitives (`<Input>`, `<Select>`, …) pass their own
    // `fieldComponents` list via options.
    fieldComponents: ["input", "textarea", "select"],
    valueProps: ["value", "checked", "selected"],
    changeProps: ["onChange", "onValueChange", "onCheckedChange"],
    stateHooks: ["useState", "useReducer"],
    mutateCallees: ["mutate", "mutateAsync"],
    // Universal default: the common `use*Mutation` convention (TanStack /
    // RTK Query / codegen). Projects with other mutation-hook naming pass their
    // own `persistHookPattern`.
    persistHookPattern: "^use\\w*Mutation$",
    formElements: ["form"],
    submitComponents: ["Button", "button"],
    exemptPaths: [],
};

export default createRule<Options, "handrolled">({
    name: "no-handrolled-form",
    meta: {
        type: "problem",
        docs: {
            description:
                "Forbid hand-rolled forms; route field state + persistence through a form hook (default `useAppForm`).",
        },
        messages: {
            handrolled:
                "Hand-rolled form detected: this component owns field state, renders a controlled <{{field}}>, and persists it (mutation / submit) without `{{formHook}}`. Use `{{formHook}}` instead of manual state + onChange + submit.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    formHook: {
                        type: "string",
                        description:
                            "Name of the sanctioned form hook. Its presence in a file exempts that file.",
                    },
                    fieldComponents: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "JSX component names treated as controlled form fields.",
                    },
                    valueProps: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Prop names that mark a field as value-controlled.",
                    },
                    changeProps: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Prop names that mark a field as change-handled.",
                    },
                    stateHooks: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Hook calls that count as 'owns field state'.",
                    },
                    mutateCallees: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Callee names (identifier or `.member`) that count as a persist call.",
                    },
                    persistHookPattern: {
                        type: "string",
                        description:
                            "Regex (source string) for hook names that count as a persist call.",
                    },
                    formElements: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Element names whose `onSubmit` attribute counts as a persist signal.",
                    },
                    submitComponents: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Element/component names that count as a persist signal when given `type=\"submit\"`.",
                    },
                    exemptPaths: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Regex (source strings) matched against the filename; a match skips the file.",
                    },
                },
                additionalProperties: false,
            },
        ],
    },
    defaultOptions: [DEFAULTS],
    create(context, [options]) {
        const fieldComponents = new Set(options.fieldComponents);
        const valueProps = new Set(options.valueProps);
        const changeProps = new Set(options.changeProps);
        const stateHooks = new Set(options.stateHooks);
        const mutateCallees = new Set(options.mutateCallees);
        const formElements = new Set(options.formElements);
        const submitComponents = new Set(options.submitComponents);
        const persistHookRe = new RegExp(options.persistHookPattern);
        const exemptRes = options.exemptPaths.map((p) => new RegExp(p));

        const filename = context.filename;
        if (exemptRes.some((re) => re.test(filename))) return {};

        let usesFormHook = false;
        let ownsState = false;
        let persists = false;
        let firstField: TSESTree.JSXOpeningElement | null = null;
        let firstFieldName = "";

        return {
            CallExpression(node) {
                const callee = node.callee;
                if (callee.type === AST_NODE_TYPES.Identifier) {
                    if (callee.name === options.formHook) usesFormHook = true;
                    else if (stateHooks.has(callee.name)) ownsState = true;
                    else if (persistHookRe.test(callee.name)) persists = true;
                    else if (mutateCallees.has(callee.name)) persists = true;
                } else if (
                    callee.type === AST_NODE_TYPES.MemberExpression &&
                    callee.property.type === AST_NODE_TYPES.Identifier &&
                    mutateCallees.has(callee.property.name)
                ) {
                    persists = true;
                }
            },

            JSXOpeningElement(node) {
                const nameNode = node.name;
                if (nameNode.type !== AST_NODE_TYPES.JSXIdentifier) return;
                const tag = nameNode.name;

                // Submit signals.
                const isFormEl = formElements.has(tag);
                const isSubmitEl = submitComponents.has(tag);
                if (isFormEl || isSubmitEl) {
                    for (const attr of node.attributes) {
                        if (
                            attr.type !== AST_NODE_TYPES.JSXAttribute ||
                            attr.name.type !== AST_NODE_TYPES.JSXIdentifier
                        )
                            continue;
                        if (isFormEl && attr.name.name === "onSubmit")
                            persists = true;
                        if (
                            isSubmitEl &&
                            attr.name.name === "type" &&
                            attr.value &&
                            attr.value.type === AST_NODE_TYPES.Literal &&
                            attr.value.value === "submit"
                        )
                            persists = true;
                    }
                }

                if (!fieldComponents.has(tag) || firstField) return;
                let hasValue = false;
                let hasChange = false;
                for (const attr of node.attributes) {
                    if (
                        attr.type !== AST_NODE_TYPES.JSXAttribute ||
                        attr.name.type !== AST_NODE_TYPES.JSXIdentifier
                    )
                        continue;
                    const an = attr.name.name;
                    if (valueProps.has(an)) hasValue = true;
                    else if (changeProps.has(an)) hasChange = true;
                }
                if (hasValue && hasChange) {
                    firstField = node;
                    firstFieldName = tag;
                }
            },

            "Program:exit"() {
                if (usesFormHook || !ownsState || !persists || !firstField)
                    return;
                context.report({
                    node: firstField,
                    messageId: "handrolled",
                    data: { field: firstFieldName, formHook: options.formHook },
                });
            },
        };
    },
});
