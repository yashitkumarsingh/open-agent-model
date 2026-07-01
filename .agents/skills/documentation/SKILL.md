---
name: "documentation-standards"
description: "Technical documentation guidelines, layout structures, and formatting standards."
---

# Technical Documentation Standards & Formatting Guidelines

This skill enforces standards for structuring and formatting repository documentation, ensuring consistency, visual quality, and professional layouts.

## Core Rules

### 1. Document Modularization
- Do not store all documentation in a single, massive `README.md`.
- Keep the root `README.md` as an elegant, concise landing page introducing the product slogan, vision, architecture overview, and quick-start links.
- Move details into a dedicated `docs/` folder, organized logically:
  - `docs/concepts.md`: Core theories, architecture, threat vector models.
  - `docs/cli-usage.md`: CLI installation, commands usage, CI/CD configuration.
  - `docs/examples.md`: Diverse configuration templates and reference YAML files.
  - `docs/roadmap.md`: Future directions, v1.0 specifications.

### 2. Standardized Formatting
- **Visual Callouts**: Use GitHub alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) to draw attention to crucial details, configurations, or threat warnings.
- **Code Blocks**: Specify the language on code blocks (e.g. `yaml`, `bash`, `rego`, `json`, `typescript`) to ensure correct syntax highlighting.
- **Clickable Links**: Link to all local documentation files using standard Markdown links (e.g. `[CLI Usage Guide](docs/cli-usage.md)`).

### 3. Diagram Guidelines
- Use **Mermaid** diagrams to explain pipelines, sequence diagrams, and architecture dependencies.
- Ensure styling of Mermaid nodes is clean and uses curated color palettes matching a dark-mode theme where possible.
