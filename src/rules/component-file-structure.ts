import { AST_NODE_TYPES, TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";
import {
    isPascalCase,
    isHookName,
    isComponentFile,
    getComponentNameFromFile,
} from "../utils";

type ComponentEntry = { name: string; node: TSESTree.Node };

export default createRule({
    name: "component-file-structure",
    meta: {
        type: "suggestion",
        docs: {
            description:
                "One component per file matching the filename; no top-level helpers or hooks",
        },
        messages: {
            nameMismatch:
                "Component '{{ name }}' does not match the filename '{{ filename }}'. Rename the component or the file.",
            extraComponent:
                "Component '{{ name }}' should be in a separate file. Only one component per file is allowed.",
            noHelpers:
                "Helper function '{{ name }}' should be moved to helpers.ts.",
            noHooks: "Hook '{{ name }}' should be moved to hooks.ts.",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const filename = context.filename;
        if (!isComponentFile(filename)) return {};

        const componentName = getComponentNameFromFile(filename);

        return {
            Program(program) {
                const components: ComponentEntry[] = [];

                const body = program.body;
                for (let i = 0; i < body.length; i++) {
                    const stmt = body[i];

                    // Unwrap export/skip imports inline
                    let decl: TSESTree.Node;
                    switch (stmt.type) {
                        case AST_NODE_TYPES.ImportDeclaration:
                        case AST_NODE_TYPES.ExportAllDeclaration:
                            continue;
                        case AST_NODE_TYPES.ExportNamedDeclaration:
                            if (!stmt.declaration) continue; // re-export
                            decl = stmt.declaration;
                            break;
                        case AST_NODE_TYPES.ExportDefaultDeclaration:
                            if (
                                stmt.declaration.type ===
                                AST_NODE_TYPES.Identifier
                            )
                                continue;
                            decl = stmt.declaration;
                            break;
                        default:
                            decl = stmt;
                    }

                    if (decl.type === AST_NODE_TYPES.FunctionDeclaration) {
                        if (!decl.id) continue;
                        const name = decl.id.name;
                        if (isPascalCase(name)) {
                            components.push({ name, node: decl });
                        } else if (isHookName(name)) {
                            context.report({
                                node: decl,
                                messageId: "noHooks",
                                data: { name },
                            });
                        } else {
                            context.report({
                                node: decl,
                                messageId: "noHelpers",
                                data: { name },
                            });
                        }
                        continue;
                    }

                    if (decl.type === AST_NODE_TYPES.VariableDeclaration) {
                        const decls = decl.declarations;
                        for (let j = 0; j < decls.length; j++) {
                            const d = decls[j];
                            if (d.id.type !== AST_NODE_TYPES.Identifier)
                                continue;
                            const init = d.init;
                            if (!init) continue;

                            const itype = init.type;
                            const isFunc =
                                itype ===
                                    AST_NODE_TYPES.ArrowFunctionExpression ||
                                itype === AST_NODE_TYPES.FunctionExpression;
                            const isCall =
                                itype === AST_NODE_TYPES.CallExpression;
                            if (!isFunc && !isCall) continue; // constant — ignore

                            if (isCall) {
                                const callee = (
                                    init as TSESTree.CallExpression
                                ).callee;
                                // lazy(() => import(...)) — allowed at top level
                                if (
                                    callee.type ===
                                        AST_NODE_TYPES.Identifier &&
                                    callee.name === "lazy"
                                )
                                    continue;
                                // withStyles({...})(Component) — curried HOC
                                if (
                                    callee.type ===
                                    AST_NODE_TYPES.CallExpression
                                )
                                    continue;
                            }

                            const name = d.id.name;
                            if (isPascalCase(name)) {
                                components.push({ name, node: d });
                            } else if (isHookName(name)) {
                                if (isFunc) {
                                    context.report({
                                        node: d,
                                        messageId: "noHooks",
                                        data: { name },
                                    });
                                }
                            } else if (isFunc) {
                                context.report({
                                    node: d,
                                    messageId: "noHelpers",
                                    data: { name },
                                });
                            }
                        }
                    }
                    // Everything else (types, interfaces, enums, classes, expressions) — ignore
                }

                // Report component violations
                const total = components.length;
                if (total === 0) return;

                const singleMismatch =
                    total === 1 && components[0].name !== componentName;

                for (let i = 0; i < total; i++) {
                    const c = components[i];
                    if (c.name === componentName) continue;
                    context.report({
                        node: c.node,
                        messageId: singleMismatch
                            ? "nameMismatch"
                            : "extraComponent",
                        data: { name: c.name, filename: componentName },
                    });
                }
            },
        };
    },
});
