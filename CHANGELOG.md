# Changelog

All notable changes to OpenAgentModel will be documented here.

## 0.3.0

- **Modular Threat Engine**: Refactored the core risk-engine rule registry into isolated modules under `src/risk-engine/rules/` for improved maintainability.
- **Rule Hardening**: Added security rules including `R-015: Dangerous Tool Input Shape` to detect high-risk parameters in tool definitions, and strengthened privilege checks for delegation boundaries.
- **MCP Metadata Preservation**: Enhanced the MCP tools importer to preserve tool input schemas, source provenance (MCP server name mapping), and execution hints (destructive, idempotent, read-only annotations).
- **Security & Schema Validation Hardening**: 
  - Added strict non-empty and pattern constraints (`^[A-Za-z0-9._:-]+$`) to OpenAgentModel internal IDs and key ID reference lists.
  - Implemented referential validation for `source.mcp_server` and federated role providers (e.g. AWS ARN, GCP, Azure, Snowflake, Okta).
  - Added cycles detection validation in hierarchical data class inheritance models.
- **CLI & Testability Refactor**: 
  - Restructured all CLI commands to return exit codes instead of calling `process.exit()`, allowing programmatic harness execution in unit and e2e testing.
  - Pre-validated importer CLI flags (validating `--trust-level` and rejecting empty `--mcp-id` inputs).
  - Escaped regular expressions in SARIF code quality locator to prevent location path collisions.
- **Built-in Quality Gates**: Integrated Node.js native line (80%), branch (80%), and function (80%) test coverage checks inside the pre-commit workflow.

## 0.2.1

- Pin the project to Node 22 and update Node type definitions.
- Add deterministic `--as-of` validation for identity expiry checks.
- Enrich Agent-BOM output with governance fields.
- Add rule catalog and testing documentation.
- Tighten R-001 privilege escalation detection for side-effecting delegated tools.
