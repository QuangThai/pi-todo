import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The real-runtime suite boots pi (extension loading, jiti transform) per test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
      // These numbers understate real coverage. The real-runtime suite loads the
      // extension through pi's own jiti pipeline, so the lines it executes are
      // not attributed back to the modules vitest instruments — `src/tools` and
      // `src/index.ts` in particular are exercised far more than they report.
      // The thresholds are therefore set just under what the unit tests alone
      // achieve, to catch a deleted or skipped suite rather than to chase a
      // number that the instrumentation cannot see.
      thresholds: {
        lines: 82,
        functions: 80,
        branches: 70,
        statements: 82,
      },
    },
  },
});
