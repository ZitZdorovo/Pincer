import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 15000,
    // WebSocket integration suites create real child processes and loopback
    // servers. Keep CI parallelism bounded so Windows runners do not exhaust
    // their process handles and report a false-positive worker crash.
    maxWorkers: 4,
  },
});
