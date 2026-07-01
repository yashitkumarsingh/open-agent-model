# OpenAgentModel (oam)

> **Model your agents before they act.**
> An open Agent-BOM, threat model, and CI policy gate for AI agents and MCP-connected systems.

---

[![SARIF Validation](https://img.shields.io/badge/CI--Gate-SARIF-blueviolet?style=for-the-badge)](docs/cli-usage.md)
[![OWASP Mapping](https://img.shields.io/badge/Security-OWASP%20LLM%202025-red?style=for-the-badge)](docs/concepts.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge)](LICENSE)

OpenAgentModel is an open-source modeling language for declaring an Agent-BOM and enforcing static security checks before AI agent systems reach production.

Rather than checking runtime behaviors alone, OpenAgentModel allows security, risk, and engineering teams to declare agents, tools, models, identities, MCP servers, data classes, approvals, and policies statically. The CLI validates referential completeness, evaluates loop/escalation risks, exports SARIF, and blocks risky pull requests in CI.

---

## Technical Documentation Guide

To keep the documentation clean and developer-friendly, the specifications are divided into logical, modular guides:

1. **[Core Concepts & Threat Models](docs/concepts.md)**
   - Explains the model-first wedge, security context flows, and Agent-BOM contract.
   - Maps checks to **OWASP Top 10 for LLM Applications 2025** and emerging agentic application security patterns.
2. **[CLI Installation & Usage Guide](docs/cli-usage.md)**
   - Walkthrough of standard commands (`init`, `validate`, `diagram`, `risk`, `report`).
   - Schema field reference and GitHub Actions blocking gates via **SARIF** logs.
3. **[Built-In Rule Catalog](docs/rule-catalog.md)**
   - Documents risk rule IDs, severity, intent, and the current static-analysis scope.
4. **[10 Diverse Reference Scenarios](docs/examples.md)**
   - Copy-pasteable configuration templates matching e-commerce, healthcare, code evaluation, smart home, and supply chain topologies.
5. **[Enterprise v1.0 Roadmap](docs/roadmap.md)**
   - Outlines future features: LangGraph/CrewAI AST code importers, Sugiyama graph crossing minimization, and OpenTelemetry trace checking.
6. **[Testing Guide](TESTING.md)**
   - Lists the local Node 22 test workflow and current test coverage map.
7. **[Known Limitations](docs/known-limitations.md)**
   - Calls out current static-analysis, SARIF, MCP, and drift-detection boundaries.
8. **[Schema Versioning](docs/schema-versioning.md)**
   - Explains how schema and Agent-BOM version metadata are managed.
9. **[Release Process](docs/release-process.md)**
   - Documents the current manual release checklist and future automation target.

---

## Quick Start
```bash
# Use the pinned runtime
nvm use

# Install and build
npm install
npm run build
npm link

# Initialize config
oam init -o agentmodel.yaml

# Run validation and linker check
oam validate -i agentmodel.yaml

# Evaluate static risks
oam risk -i agentmodel.yaml --fail-on high

# Export complete HTML dashboard and Rego-style policy examples
oam report -i agentmodel.yaml -d reports/

# Compare runtime OpenTelemetry traces against design spec to find drift
oam drift -i agentmodel.yaml -t traces.json
```

---

## CI/CD Integration Gate

OpenAgentModel is designed to enforce security gates automatically inside pull requests. You can see our active workflow configuration in [.github/workflows/agent-governance.yml](.github/workflows/agent-governance.yml).

To integrate the risk scanner check into your own repository's workflow:

```yaml
name: Agent Governance Gate
on: [pull_request]

jobs:
  validate-agents:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g open-agent-model
      - name: Validate Model Integrity
        run: oam validate -i agentmodel.yaml
      - name: Enforce Security Threshold
        run: oam risk -i agentmodel.yaml --fail-on high --sarif agent-risks.sarif
```
