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

Use `--as-of` when identity expiry checks need to be deterministic in CI or review:
```bash
oam validate -i agentmodel.yaml --as-of 2026-07-01
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
- `--as-of <date>`: Validation date for identity expiry checks (`YYYY-MM-DD` or ISO date-time).

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
- `agent-bom.json` (Structured ABOM with format/version metadata, source hash, findings, models, identities, data classes, agents, tools, MCP servers, and policies)
- `policy-recommendations.md` (policy recommendations / Rego-style examples)
- `agent-risks.sarif` (SARIF JSON logs)
- `agent-risk-report.html` (Interactive dark-mode dashboard)

Use `--as-of <date>` to make report validation use the same deterministic identity expiry checks as `oam validate`.

### 6. Import MCP Tools (`oam import-mcp`)
Imports MCP tool definitions from a saved `tools/list` JSON response and links them to an MCP server declaration:
```bash
oam import-mcp -i agentmodel.yaml --mcp-id vendor-mcp --tools-file mcp-tools.json --trust-level external
```

The importer validates the tools file before mutating `agentmodel.yaml`, writes to a temp file, re-validates the transformed model, and only overwrites the original on a clean pass. This means a malformed tools file cannot corrupt the model.

Use `--normalize-ids` when MCP tool names contain characters outside the OpenAgentModel ID pattern. The original MCP tool name is still preserved in `source.original_name`.

Imported tools automatically receive `source`, `input_schema`, and `annotations` from the MCP `tools/list` response:
```json
[
  {
    "name": "create-ticket",
    "description": "Opens a support ticket.",
    "inputSchema": {
      "type": "object",
      "properties": { "customer_id": { "type": "string" } }
    },
    "annotations": {
      "readOnlyHint": false,
      "idempotentHint": false,
      "destructiveHint": false
    }
  }
]
```

Re-running the same import refreshes the stored MCP description, `input_schema`, and annotations for existing tools from that MCP server.

### 7. Discover MCP Tools (`oam discover-mcp`)
Queries an MCP stdio server, writes a snapshot, or merges discovered tools directly into an OpenAgentModel file:
```bash
oam discover-mcp --mcp-id vendor-mcp --server node --arg ./server.js --snapshot mcp-tools.snapshot.json
oam discover-mcp --mcp-id vendor-mcp --server node --arg ./server.js --out agentmodel.yaml --normalize-ids
```

Use `--arg <arg...>` for server arguments. `--args "<quoted string>"` is retained for legacy launch strings and option-like server flags.

### 8. Diff MCP Snapshots (`oam mcp-diff`)
Compares two MCP discovery snapshots and reports added, removed, and modified tools:
```bash
oam mcp-diff --before mcp-tools.before.json --after mcp-tools.after.json
```

Use `--fail-on <added,removed,schema-change,destructive-change>` to return exit code 1 if matching changes are found in the delta:
```bash
oam mcp-diff --before old.json --after new.json --fail-on destructive-change
```

### 9. Diff Agent-BOMs (`oam diff`)
Compares two Agent-BOM JSON files to report changes (added, removed, and modified tools or agents, changed risks, and new/resolved security findings) between a baseline and target branch:
```bash
oam diff --base baseline-bom.json --head head-bom.json
```

### 10. Detect Runtime Drift (`oam drift`)
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

#### MCP-Imported Tool Fields
When a tool is imported via `oam import-mcp`, the following additional fields are preserved in `agentmodel.yaml`:
```yaml
tools:
  - id: create-ticket
    type: api
    description: Opens a support ticket via the vendor MCP server.
    risk: medium
    source:
      kind: mcp
      mcp_server: vendor-mcp       # Must reference a declared mcp_servers entry
      original_name: create-ticket  # As returned by the MCP tools/list response
    input_schema:
      type: object
      properties:
        customer_id:
          type: string
    annotations:
      destructive_hint: false   # True if tool has destructive side effects
      read_only_hint: false     # True if tool is non-mutating
      idempotent_hint: true     # True if repeated calls produce the same result
```
`source.mcp_server` must reference a declared `mcp_servers` entry. When `source.kind` is `mcp` but `source.mcp_server` is missing or points to an undeclared server, `oam validate` will fail with a referential error.

Annotations from MCP servers are treated as **advisory signals**. `destructive_hint: true` strengthens risk analysis for any MCP-imported tool. `read_only_hint` is preserved in the model for human review but does not currently reduce risk severity for MCP-imported tools — annotations from external servers cannot be independently verified by static analysis.

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
- MCP-imported tools with suspicious input parameter names (command, shell, SQL, file path, URL, financial, or destructive parameters) whose declared risk may be understated (R-015).

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
