# OpenAgentModel: CLI Installation & Usage

This document describes how to install, configure, and execute the **OpenAgentModel (oam)** CLI compiler tool.

---

## Installation

### Prerequisites
- Node.js (v20+ or v22+)
- npm

### Local Build Setup
Clone the repository and install packages:
```bash
git clone https://github.com/open-agent-model/open-agent-model.git
cd open-agent-model
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
Validates your `agentmodel.yaml` config against the JSON Schema and runs referential semantic link checks (verifying that all declared delegates, tool bindings, and data classes exist).
```bash
oam validate -i agentmodel.yaml
```

### 3. Analyze Risks (`oam risk`)
Scans the model configuration for architectural flaws and custom policy violations.
```bash
# Returns exit code 1 if any high or critical warnings are flagged
oam risk -i agentmodel.yaml --fail-on high --sarif reports/agent-risks.sarif
```

#### Flags:
- `-i, --input <file>`: Input specification YAML file (default: `agentmodel.yaml`).
- `--fail-on <level>`: Threat level threshold that triggers a non-zero exit code (`low`, `medium`, `high`, `critical`).
- `--sarif <file>`: Output path to save the standard SARIF log file.

### 4. Render Architecture Diagram (`oam diagram`)
Lays out a beautiful SVG architecture threat map highlighting trust boundaries and unapproved links:
```bash
oam diagram -i agentmodel.yaml -o agent-map.svg
```

### 5. Generate Governance Packs (`oam report`)
Compiles syntax checks, diagrams, risk findings, and policy recommendations into a single folder:
```bash
oam report -i agentmodel.yaml -d reports/
```
Generated outputs in the directory:
- `agent-map.svg` (Visual Map)
- `agent-bom.json` (Structured ABOM)
- `policy-recommendations.md` (Open Policy Agent Rego codes)
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
