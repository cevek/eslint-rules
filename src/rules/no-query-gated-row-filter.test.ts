import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "./no-query-gated-row-filter";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

/**
 * Every case below is lifted from `useAddSaleData.ts` — the violation AND the
 * legal neighbours it shares a file with. That pairing is the point: a broken
 * version of this rule fires on the neighbours, so they are what proves the
 * discriminators rather than the happy path.
 */
ruleTester.run("no-query-gated-row-filter", rule, {
        valid: [
            // The neighbour that decides the suspense axis: same shape, same file,
            // `useSuspense*` source. A half-loaded state is not representable, so
            // the filter cannot silently pass everything.
            {
                code: `
                    function useData() {
                        const {data: page} = useSuspenseAppointments({});
                        const {data: salesPage} = useSuspenseSearchSalesByAppointment([]);
                        const taken = new Set((salesPage?.content ?? []).map((s) => s.refUuid));
                        return (page?.content ?? []).filter((a) => !taken.has(a.uuid));
                    }
                `,
            },
            // Filtering a list by its OWN contents is one query — nothing is being
            // gated on a second load.
            {
                code: `
                    function useData() {
                        const {data: page} = useAppointments({});
                        return (page?.content ?? []).filter((a) => Boolean(a.uuid));
                    }
                `,
            },
            // The criterion comes from the SAME response as the rows. There is no
            // second load to be half-done: if the array is there, so is the value
            // being compared against, so the filter can never silently pass all.
            {
                code: `
                    function useData() {
                        const {data: page} = useAppointments({});
                        return (page?.content ?? []).filter((a) => a.id !== page?.selectedId);
                    }
                `,
            },
            // Composition from a request parameter and from local state: both are
            // legal sources, neither can be half-there.
            {
                code: `
                    function useData(allowed) {
                        const {data: page} = useAppointments({});
                        const [hidden, setHidden] = useState([]);
                        return (page?.content ?? []).filter((a) => allowed.has(a.id) && !hidden.includes(a.id));
                    }
                `,
            },
            // A `useMemo` DEPENDENCY LIST mentions a binding without the value
            // flowing from it. Without this the taint spreads to 64-87% of the local
            // names in the repo's busiest containers.
            {
                code: `
                    function useData(query) {
                        const {data: page} = useAppointments({});
                        const needle = useMemo(() => query.trim(), [query, page]);
                        return rows.filter((r) => r.name.includes(needle));
                    }
                `,
            },
            // A parameter that merely SPELLS like a query binding elsewhere in the
            // module. Name-keyed tracking flagged this; `TeamView.tsx` binds a bare
            // \`data\` from a \`useQuery\`, which made every unrelated \`data\` in that
            // file a violation.
            {
                code: `
                    function Panel() {
                        const {data: page} = usePatients({});
                        return page;
                    }
                    export function pickIds(page, ids) {
                        return ids.filter((id) => page.includes(id));
                    }
                `,
            },
            // Destructuring something OTHER than \`data\` is not a query read — the
            // shape is what identifies a react-query handle.
            {
                code: `
                    function useSave() {
                        const {mutateAsync} = useUpdatePatient();
                        const {data: page} = usePatients({});
                        return (page?.content ?? []).filter((p) => mutateAsync.length > 0);
                    }
                `,
            },
            // An identifier in TYPE position is not a value being consulted.
            {
                code: `
                    function useData() {
                        const {data: page} = useAppointments({});
                        const seen = new Set<typeof page>();
                        return rows.filter((r) => seen.has(r));
                    }
                `,
            },
            // Resolving a NAME for a cell already on screen — CLAUDE.md's written
            // exception (i). `.find` on a second query is a placeholder while it
            // loads, not a gate over which rows exist. Seven of these live in the
            // repo; if this case ever goes red the rule has re-acquired the seven
            // curated exemptions that sinking it was meant to avoid.
            {
                code: `
                    function Panel() {
                        const {data: appointment} = useAppointment(1);
                        const {data: typesPage} = useAppointmentTypes({});
                        const typeName = (typesPage?.content ?? []).find((t) => t.id === appointment?.typeId)?.name;
                        return typeName;
                    }
                `,
            },
        ],
    invalid: [
        // The shape in `useAddSaleData.ts:143`: the picker hides visits that already
        // carry a PAID / REFUNDED sale, and that hiding is the only thing between an
        // operator and a second charge on a refunded visit.
        {
            code: `
                function useAddSaleData() {
                    const {data: appointmentsPage} = useAppointments({});
                    const appointmentUuids = (appointmentsPage?.content ?? []).map((a) => a.uuid);
                    const {data: salesByAppointmentPage} = useSearchSalesByAppointment(appointmentUuids);
                    const takenAppointmentUuids = useMemo(() => {
                        const set = new Set();
                        for (const sale of salesByAppointmentPage?.content ?? []) {
                            if (sale.status === 'PAID' && sale.refUuid) set.add(sale.refUuid);
                        }
                        return set;
                    }, [salesByAppointmentPage]);
                    return (appointmentsPage?.content ?? [])
                        .filter((a) => Boolean(a.uuid))
                        .filter((a) => !takenAppointmentUuids.has(a.uuid));
                }
            `,
            errors: [{ messageId: "queryGatedFilter", data: { binding: "takenAppointmentUuids", hook: "useSearchSalesByAppointment" } }],
        },
        // The SAME defect with the predicate hoisted to a named const. Hoisting is
        // the natural move under this repo's ~200-line file rule, and reading only
        // inline callbacks would let a refactor of the violating file turn the gate
        // green over an untouched double charge.
        {
            code: `
                function useAddSaleData() {
                    const {data: appointmentsPage} = useAppointments({});
                    const {data: salesPage} = useSearchSalesByAppointment([]);
                    const taken = new Set((salesPage?.content ?? []).map((s) => s.refUuid));
                    const isOfferable = (a) => !taken.has(a.uuid);
                    return (appointmentsPage?.content ?? []).filter(isOfferable);
                }
            `,
            errors: [{ messageId: "queryGatedFilter", data: { binding: "taken", hook: "useSearchSalesByAppointment" } }],
        },
        // The predicate as a hoisted `function` declaration — the other half of the
        // named-predicate resolution, which had no test until re-review found the
        // mutant surviving.
        {
            code: `
                function useRows() {
                    const {data: rowsPage} = useRows({});
                    const {data: blockedPage} = useBlocked({});
                    function isVisible(r) {
                        return !(blockedPage?.content ?? []).includes(r.id);
                    }
                    return (rowsPage?.content ?? []).filter(isVisible);
                }
            `,
            errors: [{ messageId: "queryGatedFilter" }],
        },
        // The emptiness fallback moved into the destructuring. Same defect, shorter
        // spelling — `= {content: []}` is exactly the "not loaded reads as empty"
        // this rule is about.
        {
            code: `
                function useRows() {
                    const {data: rowsPage} = useRows({});
                    const {data: blocked = {content: []}} = useBlocked({});
                    return (rowsPage?.content ?? []).filter((r) => !blocked.content.includes(r.id));
                }
            `,
            errors: [{ messageId: "queryGatedFilter" }],
        },
        // An array literal that is NOT a dependency list carries the query like any
        // other expression. The exemption was first drawn at "any array in argument
        // position", which silenced this while `new Set([x])` still fired.
        {
            code: `
                function useRows() {
                    const {data: rowsPage} = useRows({});
                    const {data: blockedPage} = useBlocked({});
                    return (rowsPage?.content ?? []).filter((r) => !contains([blockedPage], r.id));
                }
            `,
            errors: [{ messageId: "queryGatedFilter" }],
        },
        // No `useMemo` hop, no Set — the bare version of the same defect, so the
        // rule is not pinned to one file's spelling.
        {
            code: `
                function useVisibleRows() {
                    const {data: rowsPage} = useRows({});
                    const {data: blockedPage} = useBlocked({});
                    return (rowsPage?.content ?? []).filter((r) => !(blockedPage?.content ?? []).includes(r.id));
                }
            `,
            errors: [{ messageId: "queryGatedFilter" }],
        },
    ],
});
