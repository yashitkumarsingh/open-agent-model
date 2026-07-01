# Security Policy

OpenAgentModel is an early open-source security tool. Please report suspected vulnerabilities privately when possible.

## Supported Versions

The active `main` branch and the latest published package version receive security fixes.

## Reporting a Vulnerability

Use GitHub private vulnerability reporting for this repository if it is available. If private reporting is unavailable, open a minimal public issue asking for a maintainer contact path, but do not include exploit details, secrets, or sensitive customer data.

Please include:

- Affected version or commit SHA.
- Minimal reproduction steps.
- Expected and actual behavior.
- Impact assessment and any known workaround.

## Scope

Security reports can include parser bypasses, incorrect risk-gate behavior, unsafe generated policy examples, dependency vulnerabilities, or CLI behavior that could corrupt or disclose model files.

Generated Rego-style examples and static findings are advisory outputs. They do not prove runtime enforcement unless users deploy matching controls in their own environment.
