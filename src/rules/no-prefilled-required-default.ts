import fs from "node:fs";
import path from "node:path";
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * A required field may not be pre-filled with an invented literal.
 *
 * `time: z.string().min(1)` next to `time: initial?.time ?? '09:00'` is a rule
 * that cannot fail: the value is never empty, so the save is never refused, and
 * the asterisk promises a choice the operator never got to make. The booking
 * dialog shipped appointments at 09:00 this way — schema present, star present,
 * validation dead.
 *
 * What counts as invented is decided syntactically, because that is exactly the
 * distinction that matters: a STRING/NUMBER LITERAL written in the source is the
 * developer's guess, while `record?.field ?? ''`, a prop, or a call is data the
 * operator or the record supplied. So `?? 'Europe/Amsterdam'` is flagged and
 * `?? ''` is not.
 *
 * Requiredness is read from the schema handed to the same `useAppForm` call:
 * inline `z.object({…})`, a same-file const, or a schema module imported by
 * relative path (`./booking-schema.ts`, `./helpers.ts`). A schema this rule
 * cannot resolve is not guessed at — the check simply does not fire, which is
 * stated here so the gap is known rather than assumed away.
 */

const REQUIRED_PATTERNS = [
    // `key: z.string().trim().min(1)`, `key: z.array(...).min(1)`
    (key: string) => new RegExp(`\\b${key}\\s*:\\s*z\\.[^\\n]*?\\.min\\(1`),
    // `if (!value.key.trim())` / `value.key == null` inside a superRefine
    (key: string) => new RegExp(`!\\s*value\\.${key}\\.trim\\(\\)`),
    (key: string) => new RegExp(`value\\.${key}\\s*==\\s*null`),
    // `issueOn<T>(ctx, 'key')` / `path: ['key']`
    (key: string) => new RegExp(`issueOn<[^>]*>\\(\\s*ctx\\s*,\\s*'${key}'`),
];

function isRequiredIn(text: string, key: string): boolean {
    return REQUIRED_PATTERNS.some((build) => build(key).test(text));
}

/** The literal a default settles on, or `null` when it comes from data. */
function inventedLiteral(node: TSESTree.Node): string | null {
    if (node.type === AST_NODE_TYPES.Literal) {
        if (typeof node.value === "string") return node.value === "" ? null : node.value;
        if (typeof node.value === "number") return String(node.value);
        return null;
    }
    // `record?.x ?? 'guess'` — the fallback is the invented half.
    if (node.type === AST_NODE_TYPES.LogicalExpression && node.operator === "??") {
        return inventedLiteral(node.right);
    }
    // `cond ? fromData : 'guess'` — either branch may be the guess.
    if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return inventedLiteral(node.consequent) ?? inventedLiteral(node.alternate);
    }
    if (node.type === AST_NODE_TYPES.TSAsExpression) return inventedLiteral(node.expression);
    return null;
}

/** Source text of every place this file's schema could be written. */
function schemaSources(filename: string, source: string): string {
    let text = source;
    const dir = path.dirname(filename);
    for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
        const spec = match[1];
        for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
            const candidate = path.resolve(dir, spec.replace(/\.tsx?$/, "") + ext);
            try {
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    text += "\n" + fs.readFileSync(candidate, "utf8");
                    break;
                }
            } catch {
                // Unreadable sibling: leave it out rather than fail the lint run.
            }
        }
    }
    return text;
}

export default createRule<[], "prefilledRequired">({
    name: "no-prefilled-required-default",
    meta: {
        type: "problem",
        docs: {
            description:
                "A field the schema requires must not be pre-filled with an invented literal — the rule could never fail.",
        },
        messages: {
            prefilledRequired:
                "`{{key}}` is required by the schema and defaults to the literal {{value}}, so the requirement can never fail: the field wears an asterisk, the save is never refused, and the record ships a value nobody chose. Seed it from the edited record or the operator's action, or leave it empty.",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const source = context.sourceCode.getText();
        const text = schemaSources(context.filename, source);
        return {
            Property(node) {
                if (node.key.type !== AST_NODE_TYPES.Identifier || node.key.name !== "defaultValues") return;
                if (node.value.type !== AST_NODE_TYPES.ObjectExpression) return;
                for (const prop of node.value.properties) {
                    if (prop.type !== AST_NODE_TYPES.Property) continue;
                    if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;
                    const key = prop.key.name;
                    if (!isRequiredIn(text, key)) continue;
                    const literal = inventedLiteral(prop.value as TSESTree.Node);
                    if (literal === null) continue;
                    context.report({
                        node: prop,
                        messageId: "prefilledRequired",
                        data: { key, value: `'${literal}'` },
                    });
                }
            },
        };
    },
});
