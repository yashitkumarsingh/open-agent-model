export interface SystemModel {
  system: string;
  version: string;
  agents: Agent[];
  tools?: Tool[];
  mcp_servers?: McpServer[];
  data_classes?: DataClass[];
  policies?: string[];
}

export interface Agent {
  id: string;
  purpose: string;
  framework?: string;
  autonomy?: AgentAutonomy;
  memory?: AgentMemory;
  allowed_tools?: string[];
  denied_tools?: string[];
  approval_required_for?: string[];
  allowed_delegates?: string[];
  retry_policy?: RetryPolicy;
  spend_limit?: SpendLimit;
}

export type AgentAutonomy = 'autonomous' | 'supervised' | 'human-approval-required' | 'semi-autonomous';

export type AgentMemoryType = 'vector' | 'key-value' | 'relational' | 'cache' | 'none';

export interface AgentMemory {
  type: AgentMemoryType;
  contains?: string[];
  write_access?: boolean;
  poisoning_protection?: boolean;
}

export interface RetryPolicy {
  max_retries?: number;
  loop_detection?: boolean;
  failure_handling?: string;
}

export interface SpendLimit {
  max_cost_usd?: number;
  currency?: string;
  time_window?: string;
}

export interface Tool {
  id: string;
  type: string;
  description?: string;
  data_classes?: string[];
  risk?: ToolRisk;
  requires_human_approval?: boolean;
}

export type ToolRisk = 'low' | 'medium' | 'high' | 'critical';

export interface McpServer {
  id: string;
  trust_level: McpTrustLevel;
  exposes?: string[];
}

export type McpTrustLevel = 'internal' | 'partner' | 'external' | 'untrusted';

export interface DataClass {
  id: string;
  sensitivity: DataSensitivity;
  classification: DataClassification;
}

export type DataSensitivity = 'low' | 'medium' | 'high' | 'critical';

export type DataClassification = 'pii' | 'financial' | 'credentials' | 'internal_data' | 'public';
