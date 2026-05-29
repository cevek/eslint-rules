import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

export default createRule({
    name: "no-template-literal-classname",
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Ban template literals in JSX className. Use cn() from '@/lib/utils' instead.",
        },
        messages: {
            useCn:
                "Use cn() from '@/lib/utils' instead of template literals in className. Example: cn(s.a, condition && s.b)",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            JSXAttribute(node) {
                // 1. attr name must be `className`
                const attrName = node.name;
                if (
                    attrName.type !== AST_NODE_TYPES.JSXIdentifier ||
                    attrName.name !== "className"
                )
                    return;

                // 2. value must be `{...}`
                const value = node.value;
                if (
                    !value ||
                    value.type !== AST_NODE_TYPES.JSXExpressionContainer
                )
                    return;

                // 3. expression must be a template literal
                const expr = value.expression;
                if (expr.type !== AST_NODE_TYPES.TemplateLiteral) return;

                context.report({ node: expr, messageId: "useCn" });
            },
        };
    },
});
