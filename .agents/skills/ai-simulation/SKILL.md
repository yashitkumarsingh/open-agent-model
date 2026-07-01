---
name: "ai-simulation-risk-modeling"
description: "AI systems analysis, simulation models, and clean AI threat boundary reasoning inspired by Andrej Karpathy."
---

# AI Systems Modeling & First-Principles Threat Reasoning

This skill captures first-principles reasoning about AI agent architectures, failure vectors, and clean, self-contained simulation logic inspired by Andrej Karpathy.

## Core Guidelines

### 1. Focus on Agentic-Specific Threats
Understand that agents fail differently than traditional microservices:
- **Indirect Prompt Injection (OWASP-1)**: Occurs when an agent reads untrusted text via a tool (e.g., CRM note, ticket detail) which hijacks its reasoning. The risk is high if that tool doesn't scrub commands or if the agent has unchecked write tools.
- **Memory/Data Poisoning (OWASP-3)**: If an agent writes untrusted output to its own vector memory, those injected payloads will be fetched during future prompt assemblies, permanently poisoning the system context.
- **Excessive Agency (OWASP-8)**: Giving agents payment, execution, or destructive tools without strict human-approval gates.

### 2. Simple, Self-Contained Algorithms
- Build core engines from scratch with minimum dependencies. This makes the code transparent, easy to test, and light on runtime footprints.
- E.g., The SVG diagram rendering uses pure vector geometry and node columns rather than loading a massive layout engine. This keeps the execution path completely clear and explainable.

### 3. State & State-Transition Scenarios
- When modeling threat paths, treat the agent system as a state machine.
- Scenarios (e.g. prompt injection, poisoned memory) must simulate step-by-step traversal:
  - *Can a user command trigger Tool X?*
  - *Can Tool X fetch resource Y?*
  - *Can resource Y delegate to Agent Z with higher credentials?*
  - *Does a human gate block the transition?*
- Track the cascade of permissions to ensure safety bounds are met.
