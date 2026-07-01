import { SystemModel } from '../../core/model.js';

export interface Finding {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  agentId: string;
  description: string;
  recommendation: string;
  owaspMapping: string;
  context?: {
    delegateId?: string;
    toolId?: string;
    dataClassId?: string;
    mcpId?: string;
  };
}

export interface Rule {
  id: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  owaspMapping: string;
  check(data: SystemModel): Finding[];
}
