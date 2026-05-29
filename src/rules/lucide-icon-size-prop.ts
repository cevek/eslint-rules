import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

export default createRule({
    name: "lucide-icon-size-prop",
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Require the `size` prop on JSX elements imported from `lucide-react`.",
        },
        messages: {
            missingSize:
                "Lucide icons must use the 'size' prop for sizing — never CSS via className. Example: <Plus size={16} />",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        // Local names imported from `lucide-react` (handles aliases).
        // Built incrementally as ImportDeclaration visitors fire — imports
        // always come before JSX in source order, so the set is complete by
        // the time JSXOpeningElement visitors run.
        const lucideIcons = new Set<string>();

        return {
            ImportDeclaration(node) {
                if (node.source.value !== "lucide-react") return;
                const specs = node.specifiers;
                for (let i = 0; i < specs.length; i++) {
                    const spec = specs[i];
                    // Only named imports — skip default / namespace
                    // (lucide doesn't ship a default; namespace imports
                    // are used via JSXMemberExpression and skipped below).
                    if (spec.type === AST_NODE_TYPES.ImportSpecifier) {
                        lucideIcons.add(spec.local.name);
                    }
                }
            },

            JSXOpeningElement(node) {
                // Cheap early exit: no lucide imports at all
                if (lucideIcons.size === 0) return;

                const name = node.name;
                // Skip <Foo.Bar />, fragments, etc.
                if (name.type !== AST_NODE_TYPES.JSXIdentifier) return;
                if (!lucideIcons.has(name.name)) return;

                const attrs = node.attributes;
                for (let i = 0; i < attrs.length; i++) {
                    const a = attrs[i];
                    // {...spread} → can't statically check, bail out
                    if (a.type === AST_NODE_TYPES.JSXSpreadAttribute) return;
                    const aName = a.name;
                    if (
                        aName.type === AST_NODE_TYPES.JSXIdentifier &&
                        aName.name === "size"
                    )
                        return; // size present → ok
                }

                context.report({ node, messageId: "missingSize" });
            },
        };
    },
});
