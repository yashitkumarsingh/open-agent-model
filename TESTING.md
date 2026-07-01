# Testing

OpenAgentModel is tested with the Node.js native test runner and TypeScript sources loaded through `tsx`.

## Runtime

Use the pinned Node 22 runtime before installing or running tests:

```bash
nvm use
npm install
```

The repository includes `.nvmrc`, `.node-version`, and `engine-strict=true` so local and CI runs stay on Node 22.

## Commands

Run the full test suite:

```bash
npm test
```

Run tests against an already-built `dist/` directory:

```bash
npm run test:compiled
```

Run the same local gate used before commits:

```bash
npm run precommit
```

## Coverage Map

- `test/commands/cli.test.ts`: compiled CLI smoke tests for validate, risk, drift, and diagram commands.
- `test/core/linker.test.ts`: JSON Schema validation plus semantic linker checks for references, duplicate IDs, identities, scopes, and deterministic expiry dates.
- `test/core/locator.test.ts`: source-location helper behavior used by SARIF/reporting output.
- `test/report/sarif-builder.test.ts`: SARIF rule IDs, severities, locations, and parse handling.
- `test/risk-engine/policy-evaluator.test.ts`: experimental declarative policy evaluator behavior.
- `test/risk-engine/rules.test.ts`: built-in static governance rules R-001 through R-014.

Tests create temporary YAML or generated artifact files as needed and clean them up in `finally` blocks.
