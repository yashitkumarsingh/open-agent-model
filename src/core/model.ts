export interface SystemModel {
  system: string;
  version: string;
  agents: Agent[];
  tools?: Tool[];
  mcp_servers?: McpServer[];
  data_classes?: DataClass[];
  models?: ModelCatalogEntry[];
  identities?: IdentityCatalogEntry[];
  policies?: (string | DeclarativePolicy)[];
}

export interface ModelCatalogEntry {
  id: string;
  provider: string;
  deployment?: string;
  allowed_for?: string[];
  data_retention?: 'enabled' | 'disabled';
  region?: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

export interface IdentityCatalogEntry {
  id: string;
  type: string;
  owner?: string;
  expires_at?: string;
  scopes?: string[];
}

export interface DeclarativePolicy {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  when: {
    'agent.autonomy'?: string;
    'tool.risk'?: string;
  };
  require: {
    'tool.requires_human_approval'?: boolean;
    'agent.spend_limit.max_cost_usd'?: number;
  };
}

export interface Agent {
  id: string;
  purpose: string;
  model?: string;
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
  side_effect?: 'read' | 'external_write' | 'payout' | 'system_alteration';
  auth_identity?: string;
  required_scopes?: string[];
  approval?: ToolApproval;
  rate_limit?: ToolRateLimit;
  /** Provenance metadata populated when tool was imported from an MCP server. */
  source?: ToolSource;
  /** JSON Schema of the tool's input parameters (from MCP tools/list inputSchema). */
  input_schema?: Record<string, unknown>;
  /** MCP tool behaviour hints for static analysis and risk engine. */
  annotations?: ToolAnnotations;
}

export interface ToolApproval {
  mode: 'none' | 'human' | 'multi-party';
  approver_role?: string;
  expiry_seconds?: number;
}

export interface ToolRateLimit {
  max_calls_per_task: number;
}

export type ToolRisk = 'low' | 'medium' | 'high' | 'critical';

/** Origin provenance of a tool definition — populated by import-mcp. */
export interface ToolSource {
  kind: 'mcp' | 'internal' | 'external';
  mcp_server?: string;
  original_name?: string;
}

/** MCP tool behaviour hints surfaced from tools/list response annotations. */
export interface ToolAnnotations {
  destructive_hint?: boolean;
  read_only_hint?: boolean;
  idempotent_hint?: boolean;
}

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
