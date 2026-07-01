# OpenAgentModel: CLI Installation & Usage

This document describes how to install, configure, and execute the **OpenAgentModel (oam)** CLI compiler tool.

---

## Installation

### Prerequisites
- Node.js 22.14.0. This repo includes `.nvmrc` and `.node-version`.
- npm

### Local Build Setup
Clone the repository and install packages:
```bash
git clone https://github.com/yashitkumarsingh/open-agent-model.git
cd open-agent-model
nvm use
npm install
npm run build
```

Link the compiled CLI executable globally:
```bash
npm link
```

---

## CLI Commands

### 1. Initialize Configuration (`oam init`)
Creates a default `agentmodel.yaml` template file in the current working directory.
```bash
oam init -o agentmodel.yaml
```

### 2. Validate Specifications (`oam validate`)
Validates your `agentmodel.yaml` config against the JSON Schema and runs referential semantic link checks. Validation rejects unknown properties, duplicate IDs, missing delegates, missing tool bindings, missing model-agent bindings, missing tool identities, missing required identity scopes, invalid identity expiry timestamps, and data classes that are referenced but not declared.
```bash
oam validate -i agentmodel.yaml
```

### 3. Analyze Risks (`oam risk`)
Scans the model configuration for architectural flaws and built-in or experimental declarative policy violations.
```bash
# Returns exit code 1 if any high or critical warnings are flagged
oam risk -i agentmodel.yaml --fail-on high --sarif reports/agent-risks.sarif
```

#### Flags:
- `-i, --input <file>`: Input specification YAML file (default: `agentmodel.yaml`).
- `--fail-on <level>`: Threat level threshold that triggers a non-zero exit code (`low`, `medium`, `high`, `critical`).
- `--sarif <file>`: Output path to save the standard SARIF log file.

### 4. Render Architecture Diagram (`oam diagram`)
Lays out an SVG architecture threat map highlighting trust boundaries and unapproved links:
```bash
oam diagram -i agentmodel.yaml -o agent-map.svg
```

### 5. Generate Governance Packs (`oam report`)
Compiles syntax checks, diagrams, risk findings, and policy recommendations into a single folder:
```bash
oam report -i agentmodel.yaml -d reports/
```
Generated outputs in the directory:
- `agent-map.svg` (Architecture map)
- `agent-bom.json` (Structured ABOM)
- `policy-recommendations.md` (policy recommendations / Rego-style examples)
- `agent-risks.sarif` (SARIF JSON logs)
- `agent-risk-report.html` (Interactive dark-mode dashboard)

### 6. Detect Runtime Drift (`oam drift`)
Audits active runtime execution logs (OpenTelemetry trace spans) against design specifications to flag unauthorized tool execution or delegation pathways:
```bash
oam drift -i agentmodel.yaml -t traces.json
```

#### Flags:
- `-i, --input <file>`: Input specification YAML file (default: `agentmodel.yaml`).
- `-t, --traces <file>`: Input OpenTelemetry trace logs file. Supports standard JSON arrays or streaming JSON Lines (JSONL).

#### Verification Scope:
- **`agent.tool_call`**: Checks if the tool called is authorized in the agent's `allowed_tools` list.
- **`agent.delegate`**: Checks if task delegation between Agent A and Agent B matches the declared `allowed_delegates` pathway.

> [!NOTE]
> Drift analysis currently supports these OpenAgentModel span names and `gen_ai.*` attributes as a compatibility format. OTel GenAI/MCP semantic-convention adapters are roadmap work, not a current guarantee.

---

## Schema Reference

OpenAgentModel treats `agentmodel.yaml` as a strict security contract. Unknown object properties fail validation so typos such as `requires_human_aproval` cannot silently pass.

### Root
- `system`: Human-readable system ID or name.
- `version`: Version of the model definition.
- `models`: Approved model catalog.
- `identities`: Credentials, roles, and service accounts used by tools.
- `agents`: Agent definitions, model bindings, and capabilities.
- `tools`: Callable tools, side effects, auth bindings, required scopes, approvals, and rate limits.
- `mcp_servers`: MCP trust boundaries and exposed tools.
- `data_classes`: Data sensitivity and classification catalog.
- `policies`: Legacy string policies or experimental declarative policy objects.

### Models
```yaml
models:
  - id: gpt-5.5-thinking
    provider: openai
    deployment: prod-agent-router
    allowed_for: [support-triage]
    data_retention: disabled
    region: australia-east
    risk: medium
```
`allowed_for` entries must reference declared `agents`.

### Agents
```yaml
agents:
  - id: refund-executor
    purpose: "Evaluate customer requests and securely execute financial refund transfers."
    model: gpt-5.5-thinking
    autonomy: human-approval-required
    allowed_tools: [issue-refund]
```
`model` must reference a declared model. If that model declares `allowed_for`, the agent must be listed there too.

### Identities
```yaml
identities:
  - id: triage-agent-sa
    type: service_account
    owner: platform-team
    expires_at: "2026-12-31T23:59:59Z"
    scopes: [crm.read]
```
`expires_at` must be a valid future date-time when present.

### Tools
```yaml
tools:
  - id: issue-refund
    type: payment_api
    risk: critical
    side_effect: payout
    auth_identity: triage-agent-sa
    required_scopes: [refund.write]
    approval:
      mode: human
      approver_role: finance-manager
      expiry_seconds: 300
    rate_limit:
      max_calls_per_task: 1
```
`auth_identity` must reference a declared identity. When `required_scopes` is present, the bound identity must grant every listed scope. Human approval can be declared with legacy `requires_human_approval: true`, structured `approval.mode: human`, structured `approval.mode: multi-party`, or an agent-level `approval_required_for` entry.

### Built-In Governance Rules
`oam risk` includes static checks for:
- Transitive A2A privilege escalation.
- Autonomous execution of high-risk tools.
- PII crossing external or untrusted MCP boundaries.
- Memory write without poisoning protection.
- Missing retry or loop protection.
- High-impact tools missing auth identity, required scopes, credential owner, or rate limits.
- Human approval declarations missing approver role or bounded approval expiry.
- External/untrusted MCP servers exposing payout, write, command, or system-altering tools.
- Retention-enabled or high-risk models handling sensitive data.
- Agents that allow and deny the same tool.
- Delegation cycles.
- Autonomous agents with command-line, write-file, payout, or system-altering tools.

### Experimental Declarative Policies
```yaml
policies:
  - id: approve-critical-write-tools
    severity: critical
    when:
      agent.autonomy: supervised
      tool.risk: critical
    require:
      tool.requires_human_approval: true
```
This is an intentionally small matcher today. It currently supports agent autonomy, tool risk, human-approval requirements, and maximum agent spend limits.

---

## Continuous Integration (CI/CD)

Configure OpenAgentModel to block hazardous pull requests by adding a validation check to your CI/CD workflows:

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
> [!TIP]
> The exported `agent-risks.sarif` log file can be uploaded as a build artifact or linked to third-party PR security tabs (like GitHub Code Scanning) to display findings directly inside pull request line diffs.
