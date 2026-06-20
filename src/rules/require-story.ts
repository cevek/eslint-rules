import fs from "node:fs";
import path from "node:path";
import { AST_NODE_TYPES, TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";
import { isComponentFile, getComponentNameFromFile, isPascalCase } from "../utils";

/**
 * Opt-out marker: a top-of-file comment `// @no-story: <reason>` (reason required,
 * non-empty). Documents an intentional skip per the taxonomy in docs/stories.md.
 */
const NO_STORY_RE = /@no-story:\s*\S/;

/** Only component files under these roots are subject to the policy. */
const SCOPE_RE = /\/src\/(components|features)\//;

export default createRule({
    name: "require-story",
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Every shippable component has a co-located <Name>.story.tsx, or an explicit `// @no-story: <reason>` opt-out",
        },
        messages: {
            missingStory:
                "Component '{{ name }}' has no co-located '{{ name }}.story.tsx'. Add a story (see docs/stories.md), or opt out with a top-of-file comment `// @no-story: <reason>` if it's an intentional skip (covered-by-composite / dispatcher / behavioral-wrapper / trivial / shell / external).",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const filename = context.filename;
        if (!isComponentFile(filename)) return {};
        const norm = filename.replace(/\\/g, "/");
        if (!SCOPE_RE.test(norm)) return {};
        if (norm.endsWith(".story.tsx") || norm.endsWith(".test.tsx")) return {};

        // Opt-out annotation anywhere in the file.
        const src = context.sourceCode.getText();
        if (NO_STORY_RE.test(src)) return {};

        // Co-located story already exists?
        const name = getComponentNameFromFile(filename);
        const storyPath = path.join(path.dirname(filename), `${name}.story.tsx`);
        if (fs.existsSync(storyPath)) return {};

        return {
            Program(program) {
                // Only flag files that actually DEFINE a React component (skip pure
                // type/constant .tsx). Mirrors component-file-structure's heuristic:
                // a top-level PascalCase function/arrow, or a default-exported function.
                let node: TSESTree.Node | undefined;

                for (const stmt of program.body) {
                    let decl: TSESTree.Node | undefined;
                    if (stmt.type === AST_NODE_TYPES.ExportNamedDeclaration && stmt.declaration) {
                        decl = stmt.declaration;
                    } else if (stmt.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
                        // export default function() {} | () => {} | function Named() {}
                        const d = stmt.declaration;
                        if (
                            d.type === AST_NODE_TYPES.FunctionDeclaration ||
                            d.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                            d.type === AST_NODE_TYPES.FunctionExpression
                        ) {
                            node = stmt;
                            break;
                        }
                        continue;
                    } else {
                        decl = stmt;
                    }
                    if (!decl) continue;

                    if (
                        decl.type === AST_NODE_TYPES.FunctionDeclaration &&
                        decl.id &&
                        isPascalCase(decl.id.name)
                    ) {
                        node = decl;
                        break;
                    }
                    if (decl.type === AST_NODE_TYPES.VariableDeclaration) {
                        for (const d of decl.declarations) {
                            if (
                                d.id.type === AST_NODE_TYPES.Identifier &&
                                isPascalCase(d.id.name) &&
                                d.init &&
                                (d.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                                    d.init.type === AST_NODE_TYPES.FunctionExpression)
                            ) {
                                node = d;
                                break;
                            }
                        }
                        if (node) break;
                    }
                }

                if (!node) return; // no component defined here — not subject to the policy
                context.report({ node, messageId: "missingStory", data: { name } });
            },
        };
    },
});
