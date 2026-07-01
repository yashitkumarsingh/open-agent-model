# Workspace Customizations & Engineering Rules

This file outlines the workspace-scoped engineering rules and quality guidelines for developers and agent models working on **OpenAgentModel**.

---

## 1. Domain Modeling & Separation of Concerns (Martin Fowler style)
- **Declarative DSL**: The YAML configuration is the source of truth for the system design. Keep schema definitions pure and descriptive.
- **Layered Architecture**: Keep parsing, validation, risk engine logic, SVG rendering, and file exporters separated into distinct directories. Do not mix risk evaluation code inside the visual rendering scripts.

## 2. Strict Type Safety (Matt Pocock style)
- **No `any` Types**: Enforce complete type-safety. If a type is dynamic or unknown, represent it as `unknown` and narrow it using type guards.
- **Discriminated Unions**: Model polymorphic options (like Agent Autonomy types, Memory configurations, or Tool risk categories) as discriminated unions.
- **Ajv Boundaries**: Validate schema boundary files and cast validation results to their compiled TypeScript types directly.

## 3. First-Principles AI Risk Modeling (Andrej Karpathy style)
- **Minimize Dependencies**: Build visual layouts, SVG generators, and rule checkers from scratch using clean, deterministic algorithms to keep the CLI fast and self-contained.
- **Threat-Specific Rules**: Center the risk checks around actual agent failure scenarios: indirect prompt injection, training/memory data poisoning, recursive loop runaways, and A2A privilege delegation escalations.
