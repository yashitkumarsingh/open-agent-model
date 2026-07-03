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

Run coverage with the 80% line/branch/function threshold used by precommit:

```bash
npm run coverage
```

Run the same local gate used before commits:

```bash
npm run precommit
```

## Coverage Map

- `test/commands/cli.test.ts`: compiled CLI smoke tests for validate, risk, drift, and diagram commands.
- `test/commands/import-mcp.test.ts`: compiled test suite for MCP tool imports, `--normalize-ids`, duplication collision, metadata refresh, and post-mutation failures.
- `test/commands/discover-mcp.test.ts`: compiled test suite for live stdio JSON-RPC MCP discovery, error context tracking, snapshots, and model merging.
- `test/commands/mcp-diff.test.ts`: compiled test suite for MCP tools diff, `--fail-on` gates, and ANSI text sanitisation.
- `test/commands/diff.test.ts`: compiled test suite for Agent-BOM diffing and security finding delta comparisons.
- `test/commands/observe.test.ts`: compiled test suite for log ingestion, OTel trace mapping, and evidence schema validation.
- `test/commands/drift-evidence.test.ts`: compiled test suite for severity-based drift analysis and pipeline gating logic.
- `test/core/linker.test.ts`: JSON Schema validation plus semantic linker checks for references, duplicate IDs, identities, scopes, and deterministic expiry dates.
- `test/core/locator.test.ts`: source-location helper behavior used by SARIF/reporting output.
- `test/report/sarif-builder.test.ts`: SARIF rule IDs, severities, locations, and parse handling.
- `test/risk-engine/policy-evaluator.test.ts`: experimental declarative policy evaluator behavior.
- `test/risk-engine/rules.test.ts`: built-in static governance rules R-001 through R-015.

Tests create temporary YAML or generated artifact files as needed and clean them up in `finally` blocks.
