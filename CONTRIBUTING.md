# Contributing to OpenAgentModel

Thank you for contributing to OpenAgentModel! We welcome contributions to improve our agentic compiler, static risk engine rules, and schema validators.

---

## 1. Development Principles

We follow strict design rules to keep the CLI fast, reliable, and strongly typed:
- **Matt Pocock Style (Type Safety)**: Keep primary interfaces strongly typed. When external input or command parsing requires `any`, narrow it quickly with schema validation, type guards, or explicit runtime checks.
- **Andrej Karpathy Style (Minimal Dependencies)**: Write core visual renderers (SVG layout calculations) and static check rules from scratch rather than bringing in heavy external graphics engines or runtime frameworks.
- **Martin Fowler Style (Semantic DSL)**: The YAML schema is the source of truth for the system state model. Keep schema bounds declarative.

---

## 2. Setting Up Your Development Workspace

### Prerequisites
- Node.js 22.14.0 or another Node 22 release. This repository includes `.nvmrc` and `.node-version`.
- npm

### Installation
Clone and install the local workspace:
```bash
git clone https://github.com/yashitkumarsingh/open-agent-model.git
cd open-agent-model
nvm use
npm install
```

### Local Build Cycle
We compile using `tsc` to targeting ESM modules.
```bash
# Build TypeScript compiler output
npm run build

# Link executable for testing globally
npm link
```

### Formatting Code
Make sure your editor follows ESLint rules and formats using standard JS/TS conventions. Keep imports aligned with ESNext extensions:
```typescript
import { SystemModel } from '../core/model.js'; // Must include .js extension!
```

---

## 3. Adding a New Security Rule

Static risk scans are run via a modular registry pattern. To add a new threat rule:

1. Open `src/risk-engine/rules.ts`.
2. Implement the shared `Rule` interface:
   ```typescript
   import { Rule, Finding } from './rules.js';

   const myNewRule: Rule = {
     id: 'R-007',
     name: 'My New Threat Detection',
     severity: 'high',
     owaspMapping: 'OWASP-X: Target Threat Category',
     check(data: SystemModel): Finding[] {
       const findings: Finding[] = [];
       // Add analytical graph logic here...
       return findings;
     }
   };
   ```
3. Append your rule to the exported `RULES_REGISTRY` array:
   ```typescript
   export const RULES_REGISTRY: Rule[] = [
     // ... other rules
     myNewRule
   ];
   ```
4. Add or update coverage in `test/risk-engine/rules.test.ts`.
5. Document the new rule ID in `docs/rule-catalog.md`.

---

## 4. Submitting a Pull Request

- Enforce that all example configurations remain valid:
  ```bash
  npm run precommit
  ```
- Rebuild the compiler and check that there are no compile warnings.
- Keep description updates modular and clear in the commit.
