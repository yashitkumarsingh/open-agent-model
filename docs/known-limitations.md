# Known Limitations

OpenAgentModel is useful as a design-time Agent-BOM and CI gate, but it is not a runtime enforcement platform by itself.

## Static Analysis

Risk findings are computed from `agentmodel.yaml`. They can identify unsafe declarations, missing controls, and suspicious authority paths, but they do not prove that production code enforces the declared boundaries.

## SARIF Source Mapping

SARIF locations are currently based on text scanning. Findings can be mis-located when IDs appear multiple times, a problem is attached to a property rather than an object ID, YAML anchors are used, IDs contain regex-significant characters, or a reference appears before its definition.

A future version should use YAML CST/source-location metadata.

## MCP Discovery, Import & Diff

`oam discover-mcp` can query stdio MCP servers, save snapshots, or merge discovered tools directly into an OpenAgentModel file, while `oam mcp-diff` allows comparing snapshot changes. The importer supports tool ID normalisation to resolve namespace collisions. Re-imports automatically refresh existing same-source tool definitions (description, input schema, and annotations) to keep metadata up-to-date.

Live discovery currently targets stdio MCP servers and does not implement remote transports, authentication flows, or multi-page `tools/list` pagination.

## Runtime Drift

`oam drift` currently supports OpenAgentModel span names:

- `agent.tool_call`
- `agent.delegate`

It also supports selected compatibility attributes:

- `gen_ai.agent.id`
- `gen_ai.tool.id`
- `gen_ai.delegate.id`

Broader OpenTelemetry GenAI and MCP semantic-convention adapters are planned.

## Policy Examples

Generated Rego-style examples are starter material. They are not evidence that Open Policy Agent, a gateway, or any runtime guard is deployed.
