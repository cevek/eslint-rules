import { createRule } from "../create-rule";
import { isComponentFile, getComponentNameFromFile } from "../utils";

export default createRule({
    name: "component-scss-module",
    meta: {
        type: "suggestion",
        docs: {
            description:
                "A component file may import at most one SCSS module, named '<Component>.module.scss' and located next to the component. Plain .scss imports are allowed and not checked.",
        },
        messages: {
            scssMismatch:
                "SCSS module import must point to '{{ expected }}' (got '{{ actual }}').",
            multipleScss:
                "Only one SCSS module import is allowed per component file.",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const filename = context.filename;
        if (!isComponentFile(filename)) return {};

        const componentName = getComponentNameFromFile(filename);
        const expectedBasename = `${componentName}.module.scss`;
        const expectedRelative = `./${expectedBasename}`;
        let seen = false;

        return {
            ImportDeclaration(node) {
                const source = node.source.value;
                if (typeof source !== "string") return;
                // Fast reject: only `.module.scss` is checked.
                // 12 = ".module.scss".length
                if (source.length < 12 || !source.endsWith(".module.scss"))
                    return;

                if (seen) {
                    context.report({ node, messageId: "multipleScss" });
                    return;
                }
                seen = true;

                // Extract basename without splitting the whole path
                const lastSlash = source.lastIndexOf("/");
                const basename =
                    lastSlash === -1 ? source : source.slice(lastSlash + 1);

                // Wrong name
                if (basename !== expectedBasename) {
                    context.report({
                        node: node.source,
                        messageId: "scssMismatch",
                        data: { expected: expectedBasename, actual: source },
                    });
                    return;
                }

                // Name matches. Relative paths must be strict siblings.
                // (Aliased paths pass — can't be verified without tsconfig.)
                if (
                    source.charCodeAt(0) === 46 /* '.' */ &&
                    source !== expectedRelative
                ) {
                    context.report({
                        node: node.source,
                        messageId: "scssMismatch",
                        data: { expected: expectedRelative, actual: source },
                    });
                }
            },
        };
    },
});
