import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * A save control must never be disabled because the draft is invalid.
 *
 * A disabled button has no click, no focus and nowhere to put text, so it
 * cannot say WHY it is disabled. The user is left with a form that looks
 * complete and an action that does nothing — the failure this rule exists to
 * make unrepresentable. Validity belongs in the refusal path: let the click
 * happen, then show the reason at the field or next to the button.
 *
 * Disabling for a request IN FLIGHT is fine and not matched: that state is
 * labelled ("Saving…") and explains itself. So is a permission floor, which
 * this rule cannot and should not distinguish by name — it matches only
 * identifiers that mean "the values are (in)valid".
 *
 * Also bans `canSubmitWhenInvalid: false` — the form-level way to reinstate the
 * same behaviour one layer down.
 */

type Options = [
    {
        validityNames: string[];
        exemptPaths: string[];
    },
];

const DEFAULTS: Options[0] = {
    validityNames: ["canSubmit", "isValid", "isFieldsValid", "isFormValid"],
    exemptPaths: [],
};

/** Every identifier reachable inside an expression, including nested calls. */
function identifiersIn(node: TSESTree.Node, out: TSESTree.Identifier[] = []) {
    for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const value = (node as unknown as Record<string, unknown>)[key];
        const children = Array.isArray(value) ? value : [value];
        for (const child of children) {
            if (!child || typeof child !== "object") continue;
            const candidate = child as TSESTree.Node;
            if (typeof candidate.type !== "string") continue;
            if (candidate.type === AST_NODE_TYPES.Identifier)
                out.push(candidate);
            identifiersIn(candidate, out);
        }
    }
    return out;
}

export default createRule<Options, "disabledByValidity" | "canSubmitWhenInvalid">({
    name: "no-validity-disabled-submit",
    meta: {
        type: "problem",
        docs: {
            description:
                "Forbid disabling a submit control on draft validity; refuse the click with a visible reason instead.",
        },
        messages: {
            disabledByValidity:
                "`disabled` is computed from `{{name}}`, so an invalid draft produces a dead button with no reason on screen. Let the click through and report the refusal (`form.Submit`'s `gate`/`gateMessage`, or `form.refuse(...)`). Disabling is for a request in flight or a missing permission.",
            canSubmitWhenInvalid:
                "`canSubmitWhenInvalid: false` re-arms the silent disable at form level — the submit would stop firing, and nothing would say why.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    validityNames: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "Identifier names that mean 'the draft is valid'.",
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
        const validity = new Set(options.validityNames);
        const exemptRes = options.exemptPaths.map((p) => new RegExp(p));
        if (exemptRes.some((re) => re.test(context.filename))) return {};

        return {
            JSXAttribute(node) {
                if (
                    node.name.type !== AST_NODE_TYPES.JSXIdentifier ||
                    node.name.name !== "disabled" ||
                    !node.value ||
                    node.value.type !== AST_NODE_TYPES.JSXExpressionContainer
                )
                    return;
                const hit = identifiersIn(node.value.expression).find((id) =>
                    validity.has(id.name),
                );
                if (hit)
                    context.report({
                        node,
                        messageId: "disabledByValidity",
                        data: { name: hit.name },
                    });
            },

            Property(node) {
                if (
                    node.key.type === AST_NODE_TYPES.Identifier &&
                    node.key.name === "canSubmitWhenInvalid" &&
                    node.value.type === AST_NODE_TYPES.Literal &&
                    node.value.value === false
                )
                    context.report({ node, messageId: "canSubmitWhenInvalid" });
            },
        };
    },
});
