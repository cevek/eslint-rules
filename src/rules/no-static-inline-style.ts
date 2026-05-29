import { AST_NODE_TYPES, TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

function isFullyStaticObject(node: TSESTree.ObjectExpression): boolean {
    const props = node.properties;
    for (let i = 0; i < props.length; i++) {
        const prop = props[i];
        if (prop.type !== AST_NODE_TYPES.Property) return false; // SpreadElement
        const value = prop.value;
        const t = value.type;
        if (t === AST_NODE_TYPES.Literal) continue;
        if (
            t === AST_NODE_TYPES.ObjectExpression &&
            isFullyStaticObject(value)
        )
            continue;
        return false;
    }
    return true;
}

export default createRule({
    name: "no-static-inline-style",
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Forbid static inline `style` on DOM elements. Dynamic styles are allowed.",
        },
        messages: {
            noStaticStyle:
                "Avoid static inline styles on DOM elements. Use CSS classes instead.",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            JSXAttribute(node) {
                // 1. Must be `style` attribute (cheap string compare)
                const attrName = node.name;
                if (
                    attrName.type !== AST_NODE_TYPES.JSXIdentifier ||
                    attrName.name !== "style"
                )
                    return;

                // 2. Must be a JSX expression container with an object literal
                const value = node.value;
                if (
                    !value ||
                    value.type !== AST_NODE_TYPES.JSXExpressionContainer
                )
                    return;
                const expr = value.expression;
                if (expr.type !== AST_NODE_TYPES.ObjectExpression) return;

                // 3. Must be a lowercase DOM element (a-z first char)
                const opening = node.parent as TSESTree.JSXOpeningElement;
                const elemName = opening.name;
                if (elemName.type !== AST_NODE_TYPES.JSXIdentifier) return;
                const c0 = elemName.name.charCodeAt(0);
                if (c0 < 97 || c0 > 122) return;

                // 4. Object must be fully static (most expensive check — done last)
                if (isFullyStaticObject(expr)) {
                    context.report({ node, messageId: "noStaticStyle" });
                }
            },
        };
    },
});
