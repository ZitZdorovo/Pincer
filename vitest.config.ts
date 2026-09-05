import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 15000,
    // WebSocket integration suites create real loopback servers. A single
    // isolated thread avoids the intermittent fork exits seen on Windows and
    // guarantees that a green run actually executed every test file.
    pool: 'threads',
    maxWorkers: 1,
  },
});
