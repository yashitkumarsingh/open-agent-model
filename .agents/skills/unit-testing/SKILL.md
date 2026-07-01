---
name: unit-testing-standards
description: Standards and guidelines for writing first-principles, zero-dependency unit tests using Node.js native test runner in OpenAgentModel.
---

# OpenAgentModel Unit Testing Standards

This skill documents the engineering standards and patterns for testing the OpenAgentModel TS codebase. We follow Andrej Karpathy's first-principles guidelines, enforcing zero-dependency, extremely clean, and fast test architectures.

---

## 1. Core Testing Stack
- **Native Test Runner**: Use the built-in Node.js `node:test` module. Do not pull in heavy frameworks like Jest or Mocha.
- **Native Assertions**: Use the built-in Node.js `node:assert` module for assertions.
- **Direct TS Execution**: Use `tsx` (TypeScript Execute) to run test suites directly, avoiding intermediate build transpilation files chore.

---

## 2. Test Structure Guidelines

Every test file (e.g. `test/runner.test.ts`) should structure checks hierarchically using nested test blocks:

```typescript
import { test } from 'node:test';
import assert from 'node:assert';

test('Component Test Suite', async (t) => {
  await t.test('1. Specific Feature Action', () => {
    // Assert conditions
    assert.strictEqual(actual, expected, 'Meaningful failure message');
  });
});
```

---

## 3. Testing CLI Commands & Process Bounds

Since CLI commands (`process.exit`) terminate execution, do not execute them directly in the main thread of the test runner. Instead, spawn them as child processes to verify execution exit codes and stderr streams:

```typescript
import { execSync } from 'child_process';

await t.test('CLI Command Exits Correctly', () => {
  // Assert expected command failure exits with 1
  assert.throws(() => {
    execSync('node dist/index.js risk -i examples/dodgy-agent.yaml', { stdio: 'pipe' });
  }, /Command failed/, 'Insecure configurations must exit with non-zero code');
});
```

---

## 4. Coverage Analysis & Quality Gates

Run code coverage using Node's built-in experimental coverage reporter:
```bash
node --test --experimental-test-coverage --import tsx test/runner.test.ts
```

We target a minimum of **85% statement coverage** on all core risk checkers, linkers, and policy engines.
