# Built-In Rule Catalog

This catalog documents the static rules currently run by `oam risk`. Rule IDs are stable identifiers for CLI output, SARIF findings, reports, and CI gates. Implementations live in focused modules under `src/risk-engine/rules/`.

## R-001: Agent-to-Agent Privilege Escalation

Severity: critical

Detects transitive delegation paths where an agent can reach a delegate with access to high-impact or side-effecting tools the original agent cannot call directly. It also flags indirect access to high- or critical-sensitivity data classes through delegated agents.

## R-002: Autonomous Dangerous Tool Execution

Severity: high

Flags agents that can execute high-risk, critical, payment, delete, or refund-like tools without a human approval path. Approval can come from legacy `requires_human_approval`, structured `approval.mode`, or agent-level `approval_required_for`.

## R-003: PII Exfiltration via External MCP Boundary

Severity: high

Flags agents that process PII while also calling tools exposed through external or untrusted MCP servers.

## R-004: Memory Poisoning Vulnerability

Severity: high

Flags writable agent memory that does not enable `poisoning_protection`.

## R-005: Execution Loop Vulnerability

Severity: medium

Flags missing retry policies, excessive retry limits, or disabled loop detection.

## R-006: Critical Tool Auth Identity

Severity: high

Flags high-impact tools that do not declare an auth identity, required scopes, or an owned credential binding.

## R-007: Critical Tool Rate Limit

Severity: high

Flags high-impact tools that do not define `rate_limit.max_calls_per_task`.

## R-008: Approval Governance

Severity: high or medium

Flags human or multi-party approval declarations that lack an approver role, lack an expiry, or use an approval expiry longer than 3600 seconds.

## R-009: External MCP Side Effect Boundary

Severity: critical

Flags external or untrusted MCP servers that expose side-effecting tools such as command-line, file-write, external-write, payout, or system-altering tools.

## R-010: Allow Deny Tool Conflict

Severity: high

Flags agents that list the same tool in both `allowed_tools` and `denied_tools`.

## R-011: Autonomous Side Effect Tool

Severity: critical

Flags autonomous agents that can directly invoke side-effecting tools.

## R-012: Model Retention Data Boundary

Severity: high

Flags PII-handling agents using models with data retention enabled, and high-sensitivity data routed to high- or critical-risk models.

## R-013: Delegation Cycle

Severity: high

Flags agent delegation cycles that can create unbounded task routing or authority loops.

## R-014: Custom Declared Policies Compliance

Severity: policy-defined, default high

Evaluates experimental declarative policy objects in `policies`. This rule is intentionally small in scope and should be treated as an early policy authoring surface rather than a complete policy language.

## Current Limits

Rules are static checks over `agentmodel.yaml`; they do not prove runtime enforcement. Generated Rego-style examples are starter material, not a guarantee that an Open Policy Agent deployment is active. Runtime drift checks currently support OpenAgentModel span names and selected `gen_ai.*` attributes, with broader adapter work tracked on the roadmap.
