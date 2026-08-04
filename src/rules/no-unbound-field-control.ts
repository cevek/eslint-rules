import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * A field primitive bound by hand must render its field's error.
 *
 * The form bindings (`form.Input`, `form.Select`, …) wrap every control in the
 * error slot, so a field wired through them cannot be silent. Hand-rendering
 * through the `form.Field` render-prop — legitimate when a control needs
 * children, a ref or per-option state — skips that wrapper and takes the value
 * and the red border without the message. Then a rule that blocks the submit
 * has nowhere to appear, which is the exact defect this contract removes.
 *
 * So: either use the binding, or wrap the primitive in the slot yourself. Both
 * are one line; silence is not an option either way.
 *
 * Matched narrowly: only a BOUND (`field=`) primitive in a file that calls the
 * form hook. A presentational `<Input value=… onChange=…>` — a search box, a
 * filter — is untouched.
 */

type Options = [
    {
        formHook: string;
        fieldComponents: string[];
        bindingProp: string;
        slotComponent: string;
        exemptPaths: string[];
    },
];

const DEFAULTS: Options[0] = {
    formHook: "useAppForm",
    fieldComponents: [
        "Input",
        "NumberInput",
        "Textarea",
        "Select",
        "Switch",
        "Combobox",
        "SegmentedControl",
        "MaskedDateInput",
        "MaskedPhoneInput",
        "DatePickerField",
    ],
    bindingProp: "field",
    slotComponent: "FieldSlot",
    exemptPaths: [],
};

export default createRule<Options, "unbound">({
    name: "no-unbound-field-control",
    meta: {
        type: "problem",
        docs: {
            description:
                "Inside a form file, render field primitives through the form bindings so each field renders its own validation message.",
        },
        messages: {
            unbound:
                "`<{{tag}} field={…}>` is wired by hand outside `<{{slot}}>`, so this field shows no validation message — a rule that blocks the submit would have nowhere to appear. Use the form binding (`form.X`), or wrap this control in `<{{slot}} field={…}>`.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    formHook: {
                        type: "string",
                        description:
                            "Form hook whose presence marks a file as owning a form.",
                    },
                    fieldComponents: {
                        type: "array",
                        items: { type: "string" },
                        description: "Field primitive component names.",
                    },
                    bindingProp: {
                        type: "string",
                        description:
                            "Prop that marks a primitive as bound to a form field.",
                    },
                    slotComponent: {
                        type: "string",
                        description:
                            "Component that renders a field's error message; satisfies the rule as an ancestor.",
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
        const fields = new Set(options.fieldComponents);

        let ownsForm = false;
        const offenders: Array<{ node: never; tag: string }> = [];

        return {
            CallExpression(node) {
                if (
                    node.callee.type === AST_NODE_TYPES.Identifier &&
                    node.callee.name === options.formHook
                )
                    ownsForm = true;
            },

            JSXOpeningElement(node) {
                if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) return;
                const tag = node.name.name;
                if (!fields.has(tag)) return;
                const bound = node.attributes.some(
                    (attr) =>
                        attr.type === AST_NODE_TYPES.JSXAttribute &&
                        attr.name.type === AST_NODE_TYPES.JSXIdentifier &&
                        attr.name.name === options.bindingProp,
                );
                if (!bound) return;
                // An ancestor slot is the author doing by hand exactly what the
                // binding does — accept it.
                for (
                    let parent = node.parent as TSESTree.Node | undefined;
                    parent;
                    parent = parent.parent as TSESTree.Node | undefined
                ) {
                    if (
                        parent.type === AST_NODE_TYPES.JSXElement &&
                        parent.openingElement.name.type ===
                            AST_NODE_TYPES.JSXIdentifier &&
                        parent.openingElement.name.name === options.slotComponent
                    )
                        return;
                }
                offenders.push({ node: node as never, tag });
            },

            "Program:exit"() {
                if (!ownsForm) return;
                for (const { node, tag } of offenders)
                    context.report({
                        node,
                        messageId: "unbound",
                        data: { tag, slot: options.slotComponent },
                    });
            },
        };
    },
});
