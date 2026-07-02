# Known Limitations

OpenAgentModel is useful as a design-time Agent-BOM and CI gate, but it is not a runtime enforcement platform by itself.

## Static Analysis

Risk findings are computed from `agentmodel.yaml`. They can identify unsafe declarations, missing controls, and suspicious authority paths, but they do not prove that production code enforces the declared boundaries.

## SARIF Source Mapping

SARIF locations are currently based on text scanning. Findings can be mis-located when IDs appear multiple times, a problem is attached to a property rather than an object ID, YAML anchors are used, IDs contain regex-significant characters, or a reference appears before its definition.

A future version should use YAML CST/source-location metadata.

## MCP Import

`oam import-mcp` currently imports from a local `--tools-file` containing MCP `tools/list`-style JSON. It preserves source provenance, input_schema, and selected annotations, but it does not yet infer risk, side_effect, auth_identity, required_scopes, or data_classes from MCP metadata. Live MCP server discovery is roadmap work.

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
