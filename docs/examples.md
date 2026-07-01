# OpenAgentModel: Varied Reference Scenarios

This document provides copy-pasteable YAML definitions and reference architectures for 10 diverse agentic configurations.

### Directory of Reference Configurations
- **[ecommerce-refund-agent.yaml](../examples/ecommerce-refund-agent.yaml)** - E-Commerce Payout Gates & Financial Risks
- **[healthcare-triage-agent.yaml](../examples/healthcare-triage-agent.yaml)** - HIPAA Patient Data Privacy & Vector Memory writes
- **[coding-agent.yaml](../examples/coding-agent.yaml)** - Software Coding Agent CLI Command Restrictions
- **[portfolio-trader.yaml](../examples/portfolio-trader.yaml)** - Financial Portfolio Trader Budget & Loop caps
- **[support-router.yaml](../examples/support-router.yaml)** - A2A Support Router Privilege Escalation
- **[smart-home-iot.yaml](../examples/smart-home-iot.yaml)** - Smart Home IoT Physical lock actions
- **[legal-analyst.yaml](../examples/legal-analyst.yaml)** - Legal Document Analyst Read-only memory audits
- **[supply-chain.yaml](../examples/supply-chain.yaml)** - Supply Chain Logistics Partner MCP trust boundaries
- **[ai-search-rag.yaml](../examples/ai-search-rag.yaml)** - Search web crawler vector memory poisoning checks
- **[enterprise-recruiter.yaml](../examples/enterprise-recruiter.yaml)** - HR background check candidate PII isolations

---

## 1. E-Commerce Payout Handler (Autonomy & Payment Risk)
Lock dangerous payment tools behind physical human approval gates.
```yaml
agents:
  - id: refund-assessor
    purpose: "Evaluate customer return requests and calculate refund values."
    framework: langgraph
    autonomy: human-approval-required
    allowed_tools: [calculate-refund, issue-payout-transaction]
    approval_required_for: [issue-payout-transaction]

tools:
  - id: calculate-refund
    type: api
    risk: low
  - id: issue-payout-transaction
    type: payment_api
    risk: high
    requires_human_approval: true
```

---

## 2. Healthcare Clinical Triage (HIPAA Data Privacy & Memory Write)
Blocks exfiltration of sensitive patient charts and monitors memory poisoning.
```yaml
agents:
  - id: triage-assistant
    purpose: "Analyze patient symptom descriptions and recommend scheduling slots."
    framework: crewai
    autonomy: supervised
    memory:
      type: vector
      contains: [patient_health_records]
      write_access: true
      poisoning_protection: true # Prevents vector storage injections

data_classes:
  - id: patient_health_records
    sensitivity: critical
    classification: pii
```

---

## 3. Software Coding Agent (CLI Command & Execution Risk)
Restricts code generation bots from executing unverified terminal commands.
```yaml
agents:
  - id: code-reviewer-bot
    purpose: "Inspect pull requests and run unit test commands."
    autonomy: supervised
    allowed_tools: [read-source-file, run-lint-command]
    denied_tools: [execute-arbitrary-sh]

tools:
  - id: read-source-file
    type: read_file
    risk: low
  - id: run-lint-command
    type: command_line
    risk: medium
  - id: execute-arbitrary-sh
    type: command_line
    risk: critical
```

---

## 4. Financial Portfolio Trader (Autonomous Limit Capping)
Imposes monetary limits and cost-spend budgets on algorithmic trading models.
```yaml
agents:
  - id: high-frequency-trader
    purpose: "Execute equity trades based on market indicators."
    autonomy: autonomous
    allowed_tools: [submit-buy-order, submit-sell-order]
    spend_limit:
      max_cost_usd: 0.50 # Caps aggregate token and execution costs
      time_window: "1m"
```

---

## 5. Customer Support Router (A2A Privilege Escalation Vulnerability)
Flags paths where a low-privilege agent delegates tasks to a high-privilege sub-agent.
```yaml
agents:
  - id: public-router-agent
    purpose: "Answer general customer questions and route support calls."
    allowed_delegates: [account-manager-agent] # Warning: Escalation potential

  - id: account-manager-agent
    purpose: "Modifies user subscription states."
    allowed_tools: [write-subscription-db]

tools:
  - id: write-subscription-db
    type: database
    risk: high
```

---

## 6. Smart Home IoT Orchestrator (Local Boundary Isolation)
Models hardware action capabilities (e.g. locks, thermostats) within local trust zones.
```yaml
agents:
  - id: home-hub-orchestrator
    purpose: "Control connected hardware based on voice actions."
    allowed_tools: [read-device-status, toggle-door-lock]
    approval_required_for: [toggle-door-lock]

tools:
  - id: read-device-status
    type: api
    risk: low
  - id: toggle-door-lock
    type: hardware_write
    risk: high
    requires_human_approval: true
```

---

## 7. Legal Document Analyst (Read-Only Data Constraint)
Defines auditing configurations for legal agents that process contracts without write access.
```yaml
agents:
  - id: contract-reviewer
    purpose: "Highlight compliance risks in vendor service level agreements."
    allowed_tools: [query-contract-db]
    memory:
      type: cache
      contains: [contract_metadata]
      write_access: false

tools:
  - id: query-contract-db
    type: database
    risk: low
```

---

## 8. Supply Chain Logistics Agent (External MCP Trust Boundaries)
Isolates untrusted shipping partner integrations and third-party APIs.
```yaml
agents:
  - id: logistics-coordinator
    purpose: "Schedule transport shipments using third party tools."
    allowed_tools: [schedule-delivery-truck]

mcp_servers:
  - id: third-party-logistics-mcp
    trust_level: external # Marks tools exposed by this server as untrusted
    exposes: [schedule-delivery-truck]
```

---

## 9. AI Search Retriever (Web Scraper & Memory Injection Risk)
Audits search bots that traverse open web contents, requiring strict memory guardrails.
```yaml
agents:
  - id: web-crawler-agent
    purpose: "Aggregate news feeds and update internal index memory."
    allowed_tools: [scrape-web-page]
    memory:
      type: vector
      contains: [web_snippets]
      write_access: true
      poisoning_protection: true # Block unverified storage writes
```

---

## 10. Enterprise Recruiter (Candidate PII Resumes & Background Checks)
Models candidate background checks ensuring PII data classes are not sent to external servers.
```yaml
agents:
  - id: background-checker
    purpose: "Run background references searches on applicants."
    allowed_tools: [query-applicant-db]

data_classes:
  - id: applicant_pii
    sensitivity: high
    classification: pii
```
