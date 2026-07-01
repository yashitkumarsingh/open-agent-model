---
name: "dsl-architecture-modelling"
description: "Domain-Specific Language (DSL) design, software architecture patterns, and domain modeling inspired by Martin Fowler."
---

# Domain-Specific Language (DSL) & Architecture Patterns

This skill encodes design principles from Martin Fowler concerning the design of Domain-Specific Languages (DSLs), semantic models, and visual software architecture representations.

## Core Principles

### 1. Separation of Syntax and Semantic Model
- **The Schema/Syntax Layer**: YAML syntax defines the serialization format. It should be kept clean, human-readable, and declarative.
- **The Semantic Model**: Once parsed, YAML is mapped to a rich TypeScript domain model (e.g., `Agent`, `Tool`, `McpBoundary`, `SecurityPolicy`). The rest of the codebase (Risk Engine, Diagram Generator, Policy Exporter) operates strictly on the Semantic Model, never on raw YAML or untyped JSON.
- **Benefits**: If the serialization format changes (e.g., migrating from YAML to JSON or HCL), only the parser layer needs updating.

### 2. "Diagram as Sketch" (UML & Visual maps)
- Visual maps should focus on **communication** rather than complete code visualization.
- High-risk boundaries and communication pathways (e.g. Agent-to-Agent delegation, external MCP integrations) must be clearly highlighted.
- Keep layout clean: swimlanes or functional layout columns (External -> Core -> Capability -> Data Asset) are preferred over force-directed layouts because they tell a clear story of data flow and trust boundary crossing.

### 3. Layered Governance Pipelines
Build validation as a pipeline of independent, single-responsibility stages:
```
[YAML Input] ──(Parser)──> [AST / Raw JSON] ──(Schema Validator)──> [Semantic Model] ──(Risk Engine)──> [Report & Policy Exporters]
```
Each stage has distinct failure modes and exit codes, allowing users to separate syntax errors (validate) from policy/risk gates (risk checks).
