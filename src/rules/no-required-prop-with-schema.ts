import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * When a form registers a submit schema, the schema is the only authority on
 * which fields are required — a hand-written `required` prop next to a field is
 * a second one, and the two drift silently: the schema keeps blocking the
 * submit while the asterisk says the field is optional (or the reverse).
 *
 * The binding derives requiredness from the schema, so the prop buys nothing
 * where a schema exists. Where it would genuinely ADD a requirement the schema
 * doesn't have, the requirement belongs in the schema, which is what actually
 * refuses the save.
 *
 * Only fires when both facts are in the SAME file — the conservative reading,
 * and the one that needs no cross-module analysis.
 */

type Options = [
    {
        formHook: string;
        boundNamespaces: string[];
        exemptPaths: string[];
    },
];

const DEFAULTS: Options[0] = {
    formHook: "useAppForm",
    boundNamespaces: ["form"],
    exemptPaths: [],
};

export default createRule<Options, "twoAuthorities">({
    name: "no-required-prop-with-schema",
    meta: {
        type: "problem",
        docs: {
            description:
                "In a form with a submit schema, requiredness comes from the schema — drop the hand-written `required` prop.",
        },
        messages: {
            twoAuthorities:
                "This form registers a submit schema, which already decides whether `{{field}}` is required — the binding reads it from there. A `required` prop here is a second authority on the same question and will drift from the rule that actually blocks the save. Put the requirement in the schema and delete the prop.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    formHook: {
                        type: "string",
                        description: "Form hook name.",
                    },
                    boundNamespaces: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Object names whose members are form bindings (`form` in `<form.Input>`).",
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
        const exemptRes = options.exemptPaths.map((p) => new RegExp(p));
        if (exemptRes.some((re) => re.test(context.filename))) return {};
        const namespaces = new Set(options.boundNamespaces);

        let hasSchema = false;
        const offenders: Array<{ node: TSESTree.Node; field: string }> = [];

        return {
            CallExpression(node) {
                if (
                    node.callee.type !== AST_NODE_TYPES.Identifier ||
                    node.callee.name !== options.formHook
                )
                    return;
                const arg = node.arguments[0];
                if (arg?.type !== AST_NODE_TYPES.ObjectExpression) return;
                // `validators: {...}` anywhere in the options object — including
                // the conditional `isEdit ? undefined : {onSubmit: Schema}` shape,
                // where the schema governs one mode.
                hasSchema = arg.properties.some(
                    (prop) =>
                        prop.type === AST_NODE_TYPES.Property &&
                        prop.key.type === AST_NODE_TYPES.Identifier &&
                        prop.key.name === "validators",
                );
            },

            JSXOpeningElement(node) {
                if (
                    node.name.type !== AST_NODE_TYPES.JSXMemberExpression ||
                    node.name.object.type !== AST_NODE_TYPES.JSXIdentifier ||
                    !namespaces.has(node.name.object.name)
                )
                    return;
                let fieldName = "this field";
                let required: TSESTree.Node | null = null;
                for (const attr of node.attributes) {
                    if (
                        attr.type !== AST_NODE_TYPES.JSXAttribute ||
                        attr.name.type !== AST_NODE_TYPES.JSXIdentifier
                    )
                        continue;
                    if (attr.name.name === "required") required = attr;
                    if (
                        attr.name.name === "name" &&
                        attr.value?.type === AST_NODE_TYPES.Literal &&
                        typeof attr.value.value === "string"
                    )
                        fieldName = attr.value.value;
                }
                if (required) offenders.push({ node: required, field: fieldName });
            },

            "Program:exit"() {
                if (!hasSchema) return;
                for (const { node, field } of offenders)
                    context.report({
                        node,
                        messageId: "twoAuthorities",
                        data: { field },
                    });
            },
        };
    },
});
