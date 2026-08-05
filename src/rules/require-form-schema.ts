import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * A form either declares WHAT IT REQUIRES as a schema, or says in writing why it
 * requires nothing. There is no third state.
 *
 * The rule exists because the default is silent: a form with no `validators`
 * looks finished, compiles, ships — and then refuses a save with a hand-written
 * sentence next to the button, or with nothing at all. Requiredness written
 * anywhere but the schema cannot mark the field it belongs to, so it drifts from
 * the rule that actually blocks the save (the booking dialog's "Pick a patient,
 * a provider and a visit type" survived for months while time was mandatory too
 * and unnamed, and unchecked).
 *
 * Not statically decidable ("does this form have a refusal?" is a question about
 * behaviour), so it follows the precedent already set by `require-story`:
 * declare the schema, or opt out IN WRITING with a reason a reviewer reads.
 * The opt-out is what turns a default into a decision.
 *
 * `*.story.tsx` is excluded by construction: a story mounts a form as a FIXTURE
 * to show a control, never to save anything, and requiring fourteen identical
 * opt-outs would only teach the next author that this marker is noise to be
 * silenced. Same reasoning `require-story` uses for not requiring a story for a
 * story.
 */

type Options = [
    {
        formHook: string;
        optOutMarker: string;
        exemptPaths: string[];
    },
];

const DEFAULTS: Options[0] = {
    formHook: "useAppForm",
    optOutMarker: "@no-schema:",
    exemptPaths: ["\\.story\\.tsx$"],
};

export default createRule<Options, "missingSchema" | "unexplainedOptOut">({
    name: "require-form-schema",
    meta: {
        type: "problem",
        docs: {
            description:
                "Every form declares its requiredness as a submit schema, or carries a written `@no-schema:` reason.",
        },
        messages: {
            missingSchema:
                "This form declares no `validators: {onSubmit: Schema}`, so whatever it requires is written somewhere the fields cannot read — and a refused save can only describe itself in prose next to the button. Add the schema, or, if this form genuinely cannot refuse anything, opt out above the `{{hook}}` call with `// {{marker}} <why there is no refusal>`.",
            unexplainedOptOut:
                "`{{marker}}` needs a reason after it: what makes a refusal impossible on this form. Without one the opt-out is the same hand-written claim about requiredness, hidden in a comment.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    formHook: { type: "string", description: "Form hook name." },
                    optOutMarker: {
                        type: "string",
                        description: "Comment marker that waives the schema, e.g. `@no-schema:`.",
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
        const source = context.sourceCode;

        /**
         * The opt-out is read from the comments ATTACHED to the call's own
         * statement, not from the file: a marker anywhere in a 300-line panel
         * would waive a form the author never looked at. Leading comments of the
         * enclosing statement are what a reviewer sees directly above the call.
         */
        function optOutComment(node: TSESTree.Node): TSESTree.Comment | null {
            // Climb to the STATEMENT holding the call and stop there. Asking the
            // Program for its leading comments would hand every call in the file
            // the first form's opt-out.
            let current: TSESTree.Node = node;
            while (
                current.parent &&
                current.parent.type !== AST_NODE_TYPES.Program &&
                current.parent.type !== AST_NODE_TYPES.BlockStatement
            ) {
                current = current.parent as TSESTree.Node;
            }
            for (const comment of source.getCommentsBefore(current)) {
                if (comment.value.includes(options.optOutMarker.replace(/:$/, ""))) return comment;
            }
            return null;
        }

        return {
            CallExpression(node) {
                if (
                    node.callee.type !== AST_NODE_TYPES.Identifier ||
                    node.callee.name !== options.formHook
                )
                    return;
                const arg = node.arguments[0];
                const hasSchema =
                    arg?.type === AST_NODE_TYPES.ObjectExpression &&
                    arg.properties.some(
                        (prop) =>
                            prop.type === AST_NODE_TYPES.Property &&
                            prop.key.type === AST_NODE_TYPES.Identifier &&
                            prop.key.name === "validators",
                    );
                if (hasSchema) return;

                const optOut = optOutComment(node);
                if (!optOut) {
                    context.report({
                        node,
                        messageId: "missingSchema",
                        data: { hook: options.formHook, marker: options.optOutMarker },
                    });
                    return;
                }
                const marker = options.optOutMarker.replace(/:$/, "");
                const reason = optOut.value.slice(optOut.value.indexOf(marker) + marker.length);
                // A colon and a handful of words. "@no-schema" alone, or with a
                // shrug after it, is the thing this rule is trying to stop.
                if (reason.replace(/^:/, "").trim().length < 12) {
                    context.report({
                        node: optOut,
                        messageId: "unexplainedOptOut",
                        data: { marker: options.optOutMarker },
                    });
                }
            },
        };
    },
});
