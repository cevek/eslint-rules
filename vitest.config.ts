import {defineConfig} from 'vitest/config';

// `dist/` holds the COMPILED copy of every test, and running those would double
// each suite while reporting failures from a build artefact.
export default defineConfig({
    test: {include: ['src/**/*.test.ts']},
});
