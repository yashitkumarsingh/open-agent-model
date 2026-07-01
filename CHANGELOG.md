# Changelog

All notable changes to OpenAgentModel will be documented here.

## Unreleased

- Add duplicate reference-list validation for agents, tools, models, identities, memory, and MCP exposures.
- Add Agent-BOM audit metadata including format version, schema version, generator, source hash, rule-set version, and findings.
- Refresh contributor and project-readiness documentation for the Node 22 toolchain.
- Remove the duplicate build step from the precommit workflow.

## 0.2.1

- Pin the project to Node 22 and update Node type definitions.
- Add deterministic `--as-of` validation for identity expiry checks.
- Enrich Agent-BOM output with governance fields.
- Add rule catalog and testing documentation.
- Tighten R-001 privilege escalation detection for side-effecting delegated tools.
