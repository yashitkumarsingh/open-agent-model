# OpenAgentModel: Technical Roadmap & Future Directions

This document describes the long-term vision, v1.0 enterprise targets, and ongoing development priorities for **OpenAgentModel**.

---

## Technical Specifications v1.0 Roadmap

The near-term product wedge is an Agent-BOM plus CI policy gate that sits above existing agent frameworks rather than replacing them.

The development checklist outlines priorities for turning design-time models into runtime gateways:

### 1. Static Framework Code Scanners
AI engineers write agents in code first. To prevent modeling documentation from rotting, we are building compiler connectors:
- **python-ast-scanner**: Parses Python files (`LangGraph` nodes, `CrewAI` agents configurations, `AutoGen` instances) to automatically extract metadata (agent dependencies, allowed tools, memory types) and generate the corresponding `agentmodel.yaml` layout.

### 2. Sugiyama-based Graph Layout Algorithms
The current swimlane model places nodes in static vertical columns. For large topologies (>15 nodes), this creates intersecting lines. We will implement:
- **Sugiyama Layout Layering**: Node classification into ranked layers.
- **Crossing Minimization**: Re-ordering nodes dynamically within layers to minimize edge intersections, creating clean, clean architecture sketches.

### 3. Dynamic Telemetry Observability [COMPLETED in v0.2.0]
Bridge design-time declarations with real-world trace behaviors:
- **OpenTelemetry Config Exporter**: Compile modeled tool boundaries directly into OpenTelemetry trace rules (`otel-schema.json`).
- **Trace Analyzer Gate**: Compare runtime traces against design-time validation definitions, flagging drift warnings (`oam drift` CLI command).

### 4. Rego-like Policy DSL
Support writing programmatic policy checks within the `policies` configuration block in YAML.
Instead of relying only on hardcoded modules in `src/risk-engine/rules/`, compile DSL assertions dynamically:
```yaml
policies:
  - assert: "agent.autonomy == 'human-approval-required' if tool.risk == 'high'"
  - assert: "mcp.trust_level == 'internal' if data_class.classification == 'credentials'"
```
This decouples risk evaluation logic entirely from the compiler engine, allowing enterprise teams to distribute custom risk profiles.

### 5. Policy and Risk Rule Expansion
- **Richer typed policy expressions** over model, identity, tool side effect, MCP trust, and data classification fields.
- **Policy exceptions** with owners, expiry, and justification fields.
- **SARIF source-location mapping** backed by YAML CST/source metadata rather than raw text scanning.

### 6. Importers and Runtime Adapters
- **MCP tool metadata import and live stdio server discovery** [COMPLETED in v0.4.0]
- **Baseline risk diffing for pull requests (oam diff)** [COMPLETED in v0.4.0]
- **LangGraph and CrewAI importers** that emit `agentmodel.yaml`.
- **OpenTelemetry GenAI/MCP adapters** that map standard semantic-convention attributes into the current drift analyzer.
