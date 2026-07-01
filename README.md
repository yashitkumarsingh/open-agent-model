# OpenAgentModel (oam)

> **Model your agents before they act.**
> Architecture, risk, and governance readiness for production AI Agent systems.

---

[![SARIF Validation](https://img.shields.io/badge/CI--Gate-SARIF-blueviolet?style=for-the-badge)](docs/cli-usage.md)
[![OWASP Mapping](https://img.shields.io/badge/Security-OWASP%20Agentic-red?style=for-the-badge)](docs/concepts.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge)](LICENSE)

OpenAgentModel is an open-source modeling language and visual tool for designing, simulating, auditing, and governing AI agent systems before they reach production. 

Rather than checking runtime behaviors alone, OpenAgentModel allows security, risk, and engineering teams to declare agent configurations statically, enforce referential completeness, evaluate loop/escalation risks, and gate CI/CD PRs before they hit staging.

---

## Technical Documentation Guide

To keep the documentation clean and developer-friendly, the specifications are divided into logical, modular guides:

1. **[Core Concepts & Threat Models](docs/concepts.md)**
   - Explains the model-first wedge, security context flows, and visual representations.
   - Maps vulnerabilities to the **OWASP Agentic Top 10 (2026)** (A2A privilege escalation, loop overflows, memory poisoning, PII exfiltration).
2. **[CLI Installation & Usage Guide](docs/cli-usage.md)**
   - Walkthrough of standard commands (`init`, `validate`, `diagram`, `risk`, `report`).
   - Detailed instructions for setting up GitHub Actions blocking gates via **SARIF** logs.
3. **[10 Diverse Reference Scenarios](docs/examples.md)**
   - Copy-pasteable configuration templates matching e-commerce, healthcare, code evaluation, smart home, and supply chain topologies.
4. **[Enterprise v1.0 Roadmap](docs/roadmap.md)**
   - Outlines future features: LangGraph/CrewAI AST code importers, Sugiyama graph crossing minimization, and OpenTelemetry trace checking.

---

## Quick Start
```bash
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

# Export complete HTML dashboard and OPA policy recommendations
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

