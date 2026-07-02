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
  // Explicit structural signals always win
  if (
    tool.risk === 'critical' ||
    tool.type === 'payment_api' ||
    tool.side_effect === 'payout' ||
    tool.side_effect === 'system_alteration'
  ) {
    return true;
  }
  // MCP destructive_hint as an additive advisory signal (does not override)
  if (tool.annotations?.destructive_hint === true) {
    return true;
  }
  return false;
}

export function isSideEffectingTool(tool: Tool): boolean {
  // Explicit structural signals always win
  if (
    tool.type === 'command_line' ||
    tool.type === 'write_file' ||
    tool.side_effect === 'external_write' ||
    tool.side_effect === 'payout' ||
    tool.side_effect === 'system_alteration'
  ) {
    return true;
  }
  // MCP destructive_hint as additive advisory signal
  if (tool.annotations?.destructive_hint === true) {
    return true;
  }
  // read_only_hint can reduce false positives ONLY when there is no explicit
  // side_effect override AND the tool has no structural risk signals above.
  // We deliberately do NOT honour read_only_hint from external/untrusted sources
  // since those annotations cannot be verified.
  if (tool.annotations?.read_only_hint === true && tool.source?.kind !== 'mcp') {
    return false;
  }
  return false;
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

export function isPIIClass(dcId: string, dataClassMap: Map<string, DataClass>): boolean {
  const dc = dataClassMap.get(dcId);
  if (!dc) return dcId.toLowerCase().includes('pii');
  
  const path = new Set<string>([dc.id]);
  let current: DataClass | undefined = dc;
  while (current) {
    if (current.classification === 'pii' || current.id.toLowerCase().includes('pii')) {
      return true;
    }
    if (!current.inherits_from) break;
    if (path.has(current.inherits_from)) break;
    path.add(current.inherits_from);
    current = dataClassMap.get(current.inherits_from);
  }
  return false;
}

const SENSITIVITY_VALUES: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function resolveMaxSensitivity(dcId: string, dataClassMap: Map<string, DataClass>): 'low' | 'medium' | 'high' | 'critical' {
  const dc = dataClassMap.get(dcId);
  if (!dc) return 'low';
  
  let maxVal = SENSITIVITY_VALUES[dc.sensitivity] || 1;
  
  const path = new Set<string>([dc.id]);
  let current: DataClass | undefined = dc;
  while (current) {
    const val = SENSITIVITY_VALUES[current.sensitivity] || 1;
    if (val > maxVal) {
      maxVal = val;
    }
    if (!current.inherits_from) break;
    if (path.has(current.inherits_from)) break;
    path.add(current.inherits_from);
    current = dataClassMap.get(current.inherits_from);
  }
  
  if (maxVal === 4) return 'critical';
  if (maxVal === 3) return 'high';
  if (maxVal === 2) return 'medium';
  return 'low';
}
