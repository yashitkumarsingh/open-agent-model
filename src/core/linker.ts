import { DeclarativePolicy, SystemModel } from './model.js';

export interface LinkerValidationOptions {
  now?: Date;
}

export function linkAndValidateSystemModel(data: SystemModel, options: LinkerValidationOptions = {}): string[] {
  const errors: string[] = [];
  const nowMs = options.now?.getTime() ?? Date.now();

  const agents = data.agents || [];
  const tools = data.tools || [];
  const mcpServers = data.mcp_servers || [];
  const dataClasses = data.data_classes || [];
  const models = data.models || [];
  const identities = data.identities || [];

  const addUniqueIds = (label: string, records: { id?: string }[]): Set<string> => {
    const ids = new Set<string>();
    const seen = new Set<string>();

    records.forEach((record) => {
      if (!record.id) return;
      if (seen.has(record.id)) {
        errors.push(`Duplicate ID Error: ${label} id '${record.id}' is declared more than once.`);
      }
      seen.add(record.id);
      ids.add(record.id);
    });

    return ids;
  };

  const addDuplicateListItems = (owner: string, field: string, values?: string[]): void => {
    if (!values) return;
    const seen = new Set<string>();

    values.forEach((value) => {
      if (seen.has(value)) {
        errors.push(`Duplicate Reference Error: ${owner} lists '${value}' more than once in '${field}'.`);
      }
      seen.add(value);
    });
  };

  // 1. Gather all declared keys
  const agentIds = addUniqueIds('Agent', agents);
  const toolIds = addUniqueIds('Tool', tools);
  const dataClassIds = addUniqueIds('Data class', dataClasses);
  addUniqueIds('MCP server', mcpServers);
  addUniqueIds('Model', models);
  const identityIds = addUniqueIds('Identity', identities);
  addUniqueIds(
    'Policy',
    (data.policies || []).filter(
      (policy): policy is DeclarativePolicy => typeof policy === 'object' && policy !== null && typeof policy.id === 'string'
    )
  );

  const modelMap = new Map(models.map((model) => [model.id, model]));
  const identityMap = new Map(identities.map((identity) => [identity.id, identity]));

  // 2. Validate Agent cross-references
  agents.forEach((agent) => {
    addDuplicateListItems(`Agent '${agent.id}'`, 'allowed_tools', agent.allowed_tools);
    addDuplicateListItems(`Agent '${agent.id}'`, 'denied_tools', agent.denied_tools);
    addDuplicateListItems(`Agent '${agent.id}'`, 'approval_required_for', agent.approval_required_for);
    addDuplicateListItems(`Agent '${agent.id}'`, 'allowed_delegates', agent.allowed_delegates);
    addDuplicateListItems(`Agent '${agent.id}' memory`, 'contains', agent.memory?.contains);

    if (agent.model) {
      const model = modelMap.get(agent.model);
      if (!model) {
        errors.push(`Referential Error: Agent '${agent.id}' references model '${agent.model}' which is not defined in 'models'.`);
      } else if (model.allowed_for && !model.allowed_for.includes(agent.id)) {
        errors.push(`Referential Error: Agent '${agent.id}' references model '${agent.model}', but that model does not include the agent in 'allowed_for'.`);
      }
    }

    // Validate allowed_tools
    if (agent.allowed_tools) {
      agent.allowed_tools.forEach((toolId) => {
        if (!toolIds.has(toolId)) {
          errors.push(`Referential Error: Agent '${agent.id}' references allowed_tool '${toolId}' which is not defined in 'tools'.`);
        }
      });
    }

    // Validate denied_tools
    if (agent.denied_tools) {
      agent.denied_tools.forEach((toolId) => {
        if (!toolIds.has(toolId)) {
          errors.push(`Referential Error: Agent '${agent.id}' references denied_tool '${toolId}' which is not defined in 'tools'.`);
        }
      });
    }

    // Validate approval_required_for
    if (agent.approval_required_for) {
      agent.approval_required_for.forEach((toolId) => {
        if (!toolIds.has(toolId)) {
          errors.push(`Referential Error: Agent '${agent.id}' requires human approval for tool '${toolId}' which is not defined in 'tools'.`);
        }
      });
    }

    // Validate allowed_delegates
    if (agent.allowed_delegates) {
      agent.allowed_delegates.forEach((delegateId) => {
        if (!agentIds.has(delegateId)) {
          errors.push(`Referential Error: Agent '${agent.id}' references allowed_delegate '${delegateId}' which is not defined in 'agents'.`);
        }
      });
    }

    // Validate memory contains data classes
    if (agent.memory && agent.memory.contains) {
      agent.memory.contains.forEach((dcId) => {
        if (!dataClassIds.has(dcId)) {
          errors.push(`Referential Error: Agent '${agent.id}' memory contains data_class '${dcId}' which is not defined in 'data_classes'.`);
        }
      });
    }
  });

  // 3. Validate Tool data classes references
  tools.forEach((tool) => {
    addDuplicateListItems(`Tool '${tool.id}'`, 'data_classes', tool.data_classes);
    addDuplicateListItems(`Tool '${tool.id}'`, 'required_scopes', tool.required_scopes);

    if (tool.data_classes) {
      tool.data_classes.forEach((dcId) => {
        if (!dataClassIds.has(dcId)) {
          errors.push(`Referential Error: Tool '${tool.id}' references data_class '${dcId}' which is not defined in 'data_classes'.`);
        }
      });
    }

    if (tool.auth_identity && !identityIds.has(tool.auth_identity)) {
      errors.push(`Referential Error: Tool '${tool.id}' references auth_identity '${tool.auth_identity}' which is not defined in 'identities'.`);
    }

    if (tool.required_scopes && tool.required_scopes.length > 0) {
      if (!tool.auth_identity) {
        errors.push(`Semantic Error: Tool '${tool.id}' declares required_scopes but has no auth_identity.`);
      } else {
        const identity = identityMap.get(tool.auth_identity);
        if (identity) {
          const grantedScopes = new Set(identity.scopes || []);
          tool.required_scopes.forEach((scope) => {
            if (!grantedScopes.has(scope)) {
              errors.push(`Semantic Error: Tool '${tool.id}' requires scope '${scope}' but identity '${tool.auth_identity}' does not grant it.`);
            }
          });
        }
      }
    }

    // Validate tool.source referential integrity when source.kind === 'mcp'
    if (tool.source?.kind === 'mcp') {
      const mcpServerIds = new Set(mcpServers.map((m) => m.id));
      if (!tool.source.mcp_server) {
        errors.push(`Semantic Error: Tool '${tool.id}' has source.kind 'mcp' but is missing source.mcp_server.`);
      } else if (!mcpServerIds.has(tool.source.mcp_server)) {
        errors.push(`Referential Error: Tool '${tool.id}' references source.mcp_server '${tool.source.mcp_server}' which is not defined in 'mcp_servers'.`);
      }
    }
  });

  // 4. Validate Model allowed agent references
  models.forEach((model) => {
    addDuplicateListItems(`Model '${model.id}'`, 'allowed_for', model.allowed_for);

    if (model.allowed_for) {
      model.allowed_for.forEach((agentId) => {
        if (!agentIds.has(agentId)) {
          errors.push(`Referential Error: Model '${model.id}' references allowed_for agent '${agentId}' which is not defined in 'agents'.`);
        }
      });
    }
  });

  // 5. Validate Identity metadata
  identities.forEach((identity) => {
    addDuplicateListItems(`Identity '${identity.id}'`, 'scopes', identity.scopes);

    if (identity.expires_at) {
      const expiryMs = Date.parse(identity.expires_at);
      if (Number.isNaN(expiryMs)) {
        errors.push(`Semantic Error: Identity '${identity.id}' has expires_at '${identity.expires_at}' which is not a valid date-time string.`);
      } else if (expiryMs <= nowMs) {
        errors.push(`Semantic Error: Identity '${identity.id}' has expired credentials at '${identity.expires_at}'.`);
      }
    }
  });

  // 6. Validate MCP exposed tools references
  mcpServers.forEach((mcp) => {
    addDuplicateListItems(`MCP Server '${mcp.id}'`, 'exposes', mcp.exposes);

    if (mcp.exposes) {
      mcp.exposes.forEach((toolId) => {
        if (!toolIds.has(toolId)) {
          errors.push(`Referential Error: MCP Server '${mcp.id}' exposes tool '${toolId}' which is not defined in 'tools'.`);
        }
      });
    }
  });

  return errors;
}
