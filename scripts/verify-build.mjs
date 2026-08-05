// Refuses a publish whose `dist` does not match `src`.
//
// 1.2.1 shipped a tarball without `require-form-schema`: the rule was committed
// and exported at that tag, but the packed `dist` was built before it. `dist/`
// is gitignored, so no diff, tag or status could show the divergence — it was
// visible only by unpacking the published package.
//
// Two failure modes, one check: a stale build (source newer than dist) and an
// unexported rule (file added to `src/rules`, line forgotten in `index.ts`).
// Both surface as a count mismatch. The rebuild happens in `prepublishOnly`
// before this runs, so a stale dist cannot reach here at all.

import {readdirSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

const declared = readdirSync(new URL('../src/rules', import.meta.url)).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
).length;

const plugin = require('../dist/index.js');
const exported = Object.keys((plugin.default ?? plugin).rules ?? {}).length;

if (declared !== exported) {
    console.error(
        `publish refused: ${declared} rule files in src/rules, ${exported} exported from dist — ` +
            `stale build, or a rule missing from the registry in src/index.ts`,
    );
    process.exit(1);
}

console.log(`publish check: ${exported} rules, dist matches src`);
