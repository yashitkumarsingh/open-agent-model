import { Agent, DataClass, IdentityCatalogEntry, SystemModel, Tool } from '../../core/model.js';

export function buildToolMap(data: SystemModel): Map<string, Tool> {
  return new Map((data.tools || []).map((tool) => [tool.id, tool]));
}

export function buildIdentityMap(data: SystemModel): Map<string, IdentityCatalogEntry> {
  return new Map((data.identities || []).map((identity) => [identity.id, identity]));
}

export function buildDataClassMap(data: SystemModel): Map<string, DataClass> {
  return new Map((data.data_classes || []).map((dataClass) => [dataClass.id, dataClass]));
}

export function isHighImpactTool(tool: Tool): boolean {
  return (
    tool.risk === 'critical' ||
    tool.type === 'payment_api' ||
    tool.side_effect === 'payout' ||
    tool.side_effect === 'system_alteration'
  );
}

export function isSideEffectingTool(tool: Tool): boolean {
  return (
    tool.type === 'command_line' ||
    tool.type === 'write_file' ||
    tool.side_effect === 'external_write' ||
    tool.side_effect === 'payout' ||
    tool.side_effect === 'system_alteration'
  );
}

export function collectAgentDataClasses(agent: Agent, toolMap: Map<string, Tool>, dataClassMap: Map<string, DataClass>): DataClass[] {
  const ids = new Set<string>();

  (agent.allowed_tools || []).forEach((toolId) => {
    const tool = toolMap.get(toolId);
    (tool?.data_classes || []).forEach((dataClassId) => ids.add(dataClassId));
  });

  (agent.memory?.contains || []).forEach((dataClassId) => ids.add(dataClassId));

  return Array.from(ids)
    .map((dataClassId) => dataClassMap.get(dataClassId))
    .filter((dataClass): dataClass is DataClass => dataClass !== undefined);
}
