import { AST_NODE_TYPES, type TSESTree, type TSESLint } from "@typescript-eslint/utils";
import { createRule } from "../create-rule";

/**
 * The set of rows a surface shows may not be decided by a second, non-suspense
 * query.
 *
 * `x ? derive(x) : passthrough` — and its everyday spelling `(data?.content ?? [])`
 * — reads "has not loaded yet" and "failed" as "there is nothing to filter by".
 * The rows the filter exists to hide are therefore visible for the whole time
 * the query is in flight, and nothing on screen says so: a list rendered from a
 * loaded query, silently missing its own criterion.
 *
 * The dear case is the double charge. The Add-sale appointment picker hides
 * visits that already carry a PAID / REFUNDED sale; that hiding is the ONLY
 * thing between an operator and billing a refunded visit twice, because the
 * backend deliberately permits paying again after a refund. Built on a plain
 * `useQuery`, the guard switches itself off for the duration of every load.
 *
 * Detection is a conjunction, deliberately narrower than "query data reaches a
 * filter":
 *
 *   1. a `.filter` predicate — inline, or a function named and resolved here
 *   2. references a binding that derives from a query hook's `data`
 *   3. where that hook is NOT a `useSuspense*` one, and
 *   4. is a DIFFERENT query call than the array being filtered came from.
 *
 * (2)-(4) are what separate the defect from its legal neighbours. Filtering a
 * list by its own contents (`(page?.content ?? []).filter((a) => a.uuid)`) is
 * one query, so it never fires. A `useSuspense*` source cannot be half-loaded —
 * the state the rule is about is not representable — so it never fires either.
 * Both neighbours live in the same file as the violation this rule was built
 * from, which is what the tests pin.
 *
 * Bindings are tracked as SCOPE VARIABLES, not as names. Name-keying looked
 * cheaper and is wrong in this repo's busiest files: `TeamView.tsx` binds a bare
 * `data` from a `useQuery`, which would make every unrelated `(x) => data.y`
 * parameter in that module a violation. Resolution is one `Identifier → Variable`
 * map built from the scope manager, so a parameter, a shadow and an import are
 * all distinct from the query binding that happens to share their spelling.
 *
 * A query hook is recognised by its react-query destructuring shape,
 * `const {data: x} = useThing(...)`, and by name: `useSuspense*` is safe, every
 * other `use*` is not. That is the house convention (every hook file exports
 * both `useX` and `useSuspenseX`), and it means the rule needs no type
 * information — but it also means a query reached some other way (`const q =
 * useX(); q.data`), renamed, given a destructuring default, or handed across a
 * file boundary, is not seen. The check does not guess at those; it simply does
 * not fire.
 *
 * The legal escape is a deliberate SUPERSET — showing more rows than strictly
 * apply, where showing extra is harmless and the submit is gated separately.
 * That is a written decision, so it takes a written `eslint-disable-next-line`
 * saying which gate does the real work.
 */

/**
 * `.filter` alone, because composition is what the rule is about. `.find` on the
 * same query data is the written exception next to it: resolving a NAME for a
 * cell that is already on screen ("which type is this booking?") is a local
 * placeholder while it loads, not a gate over which rows exist. Every `.find`
 * this rule saw in the repo was exactly that, so widening the set would cost
 * seven curated exemptions and buy nothing — a `.find` that did decide
 * composition would be feeding a `.filter` that is still caught. `.some` /
 * `.every` / `.includes` need no entry of their own when they are written inside
 * the predicate this rule already reads.
 */
const FILTERING_METHODS = new Set(["filter"]);

/** Type-position children: an identifier there is not a value being consulted. */
const TYPE_NODES = new Set<string>([
    AST_NODE_TYPES.TSTypeAnnotation,
    AST_NODE_TYPES.TSTypeParameterInstantiation,
    AST_NODE_TYPES.TSTypeParameterDeclaration,
    AST_NODE_TYPES.TSTypeReference,
    AST_NODE_TYPES.TSTypeQuery,
]);

/** `const {data: x} = useThing()` — the react-query shape, minus the suspense ones. */
function nonSuspenseQuerySource(declarator: TSESTree.VariableDeclarator): TSESTree.CallExpression | null {
    if (declarator.id.type !== AST_NODE_TYPES.ObjectPattern) return null;
    const init = declarator.init;
    if (init?.type !== AST_NODE_TYPES.CallExpression) return null;
    if (init.callee.type !== AST_NODE_TYPES.Identifier) return null;
    const hook = init.callee.name;
    if (!hook.startsWith("use") || hook.startsWith("useSuspense")) return null;
    const destructuresData = declarator.id.properties.some(
        (prop) =>
            prop.type === AST_NODE_TYPES.Property &&
            prop.key.type === AST_NODE_TYPES.Identifier &&
            prop.key.name === "data",
    );
    return destructuresData ? init : null;
}

export default createRule<[], "queryGatedFilter">({
    name: "no-query-gated-row-filter",
    meta: {
        type: "problem",
        docs: {
            description:
                "The rows a surface shows may not be filtered by a second, non-suspense query — an unloaded query reads as 'nothing to hide'.",
        },
        messages: {
            queryGatedFilter:
                "`{{binding}}` comes from `{{hook}}`, a non-suspense query, and decides which rows are shown here. While that query is in flight or failed it is empty, so this filter hides nothing and the surface silently offers the rows it exists to withhold. Make the criterion un-loadable — a request parameter, local state, or `useSuspense*` — or, if a superset is genuinely safe here, disable this line and name the gate that does the real work.",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const { sourceCode } = context;
        const visitorKeys = sourceCode.visitorKeys;

        /** Depth-first walk; the visitor returning `false` prunes that subtree. */
        function walk(node: TSESTree.Node, visitor: (node: TSESTree.Node) => boolean | void): void {
            if (visitor(node) === false) return;
            for (const key of visitorKeys[node.type] ?? []) {
                const child = (node as unknown as Record<string, unknown>)[key];
                if (Array.isArray(child)) {
                    for (const item of child) {
                        if (item && typeof item === "object" && "type" in item) walk(item as TSESTree.Node, visitor);
                    }
                } else if (child && typeof child === "object" && "type" in child) {
                    walk(child as TSESTree.Node, visitor);
                }
            }
        }

        return {
            "Program:exit"(program: TSESTree.Program) {
                const scopeManager = sourceCode.scopeManager;
                if (!scopeManager) return;

                // Identifier → the variable it resolves to. Built once from the scope
                // manager so a shadow, a parameter and an import never collapse into
                // the query binding that shares their spelling.
                // Keyed by node identity, so a `JSXIdentifier` reference (same union
                // in the scope manager) rides along harmlessly rather than needing a
                // narrowing that would drop real resolutions.
                const resolvedOf = new Map<TSESTree.Node, TSESLint.Scope.Variable>();
                for (const scope of scopeManager.scopes) {
                    for (const reference of scope.references) {
                        if (reference.resolved) resolvedOf.set(reference.identifier, reference.resolved);
                    }
                }

                const declarators: TSESTree.VariableDeclarator[] = [];
                walk(program, (node) => {
                    if (node.type === AST_NODE_TYPES.VariableDeclarator) declarators.push(node);
                });

                /** Variable → the query call its value ultimately comes from. */
                const source = new Map<TSESLint.Scope.Variable, TSESTree.CallExpression>();
                for (const declarator of declarators) {
                    const call = nonSuspenseQuerySource(declarator);
                    if (!call || declarator.id.type !== AST_NODE_TYPES.ObjectPattern) continue;
                    for (const prop of declarator.id.properties) {
                        if (prop.type !== AST_NODE_TYPES.Property) continue;
                        if (prop.key.type !== AST_NODE_TYPES.Identifier || prop.key.name !== "data") continue;
                        // A destructuring default (`{data: x = fallback}`) is an
                        // AssignmentPattern, not an Identifier — deliberately not a
                        // source, since the fallback is exactly what would have to be
                        // reasoned about.
                        if (prop.value.type !== AST_NODE_TYPES.Identifier) continue;
                        for (const variable of scopeManager.getDeclaredVariables(declarator)) {
                            if (variable.name === prop.value.name) source.set(variable, call);
                        }
                    }
                }
                if (source.size === 0) return;

                /**
                 * First reference inside `node` that carries a query, optionally
                 * ignoring one already-known query. Skips property NAMES (`x.data` is
                 * not a reference to a `data` binding), type positions, and array
                 * literals in argument position — a `useMemo` dependency list mentions
                 * a binding without the value flowing from it.
                 */
                function findQueryReference(
                    node: TSESTree.Node,
                    ignore: TSESTree.CallExpression | null,
                ): { name: string; call: TSESTree.CallExpression; node: TSESTree.Identifier } | null {
                    let hit: { name: string; call: TSESTree.CallExpression; node: TSESTree.Identifier } | null = null;
                    /** The one place an identifier is turned into a query. */
                    const take = (identifier: TSESTree.Node): void => {
                        if (identifier.type !== AST_NODE_TYPES.Identifier) return;
                        const variable = resolvedOf.get(identifier);
                        const call = variable ? source.get(variable) : undefined;
                        if (call && call !== ignore) hit = { name: identifier.name, call, node: identifier };
                    };
                    walk(node, (current) => {
                        if (hit) return false;
                        if (TYPE_NODES.has(current.type)) return false;
                        if (
                            current.type === AST_NODE_TYPES.ArrayExpression &&
                            current.parent?.type === AST_NODE_TYPES.CallExpression &&
                            current.parent.arguments.includes(current as TSESTree.CallExpressionArgument)
                        ) {
                            return false;
                        }
                        if (current.type === AST_NODE_TYPES.Identifier) {
                            take(current);
                            return false;
                        }
                        // `x.data` reads a property NAME, not a binding called `data` —
                        // descend into the object only.
                        if (
                            current.type === AST_NODE_TYPES.MemberExpression &&
                            !current.computed &&
                            current.property.type === AST_NODE_TYPES.Identifier
                        ) {
                            walk(current.object, (inner) => {
                                if (hit) return false;
                                if (inner.type !== AST_NODE_TYPES.Identifier) return undefined;
                                take(inner);
                                return false;
                            });
                            return false;
                        }
                        return undefined;
                    });
                    return hit;
                }

                // Carry a query across the `useMemo` / intermediate-const hops real
                // code writes it in, to a fixpoint so declaration order cannot matter.
                // `source` only grows and is bounded by the file's declared variables,
                // so this terminates; the deepest chain measured in the consumer repo
                // needs three passes.
                let changed = true;
                while (changed) {
                    changed = false;
                    for (const declarator of declarators) {
                        if (declarator.id.type !== AST_NODE_TYPES.Identifier || !declarator.init) continue;
                        const declared = scopeManager.getDeclaredVariables(declarator);
                        if (declared.length === 0 || declared.every((variable) => source.has(variable))) continue;
                        const referenced = findQueryReference(declarator.init, null);
                        if (!referenced) continue;
                        for (const variable of declared) {
                            if (!source.has(variable)) {
                                source.set(variable, referenced.call);
                                changed = true;
                            }
                        }
                    }
                }

                /** The function a `.filter` argument denotes, inline or named in this file. */
                function predicateBody(argument: TSESTree.Node): TSESTree.Node | null {
                    if (
                        argument.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                        argument.type === AST_NODE_TYPES.FunctionExpression
                    ) {
                        return argument.body;
                    }
                    // A hoisted predicate is the same defect with the braces moved —
                    // and hoisting one is the natural thing to do under this repo's
                    // file-size rules, so leaving it unread would let a refactor turn
                    // the gate green over an untouched defect.
                    if (argument.type !== AST_NODE_TYPES.Identifier) return null;
                    const variable = resolvedOf.get(argument);
                    for (const definition of variable?.defs ?? []) {
                        if (definition.node.type === AST_NODE_TYPES.FunctionDeclaration) return definition.node.body;
                        if (
                            definition.node.type === AST_NODE_TYPES.VariableDeclarator &&
                            (definition.node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                                definition.node.init?.type === AST_NODE_TYPES.FunctionExpression)
                        ) {
                            return definition.node.init.body;
                        }
                    }
                    return null;
                }

                walk(program, (node) => {
                    if (node.type !== AST_NODE_TYPES.CallExpression) return;
                    const callee = node.callee;
                    if (
                        callee.type !== AST_NODE_TYPES.MemberExpression ||
                        callee.property.type !== AST_NODE_TYPES.Identifier ||
                        !FILTERING_METHODS.has(callee.property.name) ||
                        node.arguments.length === 0
                    ) {
                        return;
                    }
                    const body = predicateBody(node.arguments[0]);
                    if (!body) return;
                    const receiverQuery = findQueryReference(callee.object, null)?.call ?? null;
                    const hit = findQueryReference(body, receiverQuery);
                    if (!hit) return;
                    context.report({
                        node: hit.node,
                        messageId: "queryGatedFilter",
                        data: {
                            binding: hit.name,
                            hook: hit.call.callee.type === AST_NODE_TYPES.Identifier ? hit.call.callee.name : "a query",
                        },
                    });
                });
            },
        };
    },
});
