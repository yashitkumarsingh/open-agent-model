# Schema Versioning

OpenAgentModel currently versions the CLI, JSON Schema, built-in rule set, and Agent-BOM format together through the package version.

## Current Fields

Generated `agent-bom.json` includes:

- `bomFormat`: Always `OpenAgentModel-AgentBOM`.
- `bomVersion`: Agent-BOM output format version.
- `schemaVersion`: OpenAgentModel schema version used by the CLI.
- `ruleSetVersion`: Built-in static rule-set version.
- `version`: The user-authored model version from `agentmodel.yaml`.

For the current pre-1.0 series, `bomVersion`, `schemaVersion`, and `ruleSetVersion` match the package version.

## Compatibility Policy

- Patch releases may add optional output fields and fix validation bugs.
- Minor releases may add optional schema fields, new rules, or new report sections.
- Breaking schema changes should be reserved for a major release or clearly documented migration step.

## Future Work

As the schema matures, the repository should split package, schema, rule-set, and Agent-BOM format versions when they begin changing independently.
