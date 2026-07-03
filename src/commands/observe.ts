import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import AjvModule, { Options, Ajv as AjvInstance, ErrorObject } from 'ajv';
import addFormatsModule, { FormatsPlugin } from 'ajv-formats';

const Ajv = (
  (AjvModule as unknown as { default: new (opts?: Options) => AjvInstance }).default ||
  (AjvModule as unknown as new (opts?: Options) => AjvInstance)
);

const addFormats = (
  (addFormatsModule as unknown as { default: FormatsPlugin }).default ||
  (addFormatsModule as unknown as FormatsPlugin)
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function validateRuntimeEvidence(data: unknown): { valid: boolean; errors?: string[] } {
  const schemaPath = path.resolve(__dirname, '../../packages/schema/runtime-evidence.schema.json');
  if (!fs.existsSync(schemaPath)) {
    return { valid: false, errors: [`Schema file not found at ${schemaPath}`] };
  }

  let schema: unknown;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (error: unknown) {
    return { valid: false, errors: [`Failed to parse schema JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validate = ajv.compile(schema as Record<string, unknown>);
  const valid = validate(data);
  if (!valid) {
    const errors = validate.errors?.map((err: ErrorObject) => {
      const field = err.instancePath ? `Field '${err.instancePath}'` : 'Root';
      return `${field}: ${err.message}${err.params ? ' ' + JSON.stringify(err.params) : ''}`;
    }) || ['Unknown validation error'];
    return { valid: false, errors };
  }
  return { valid: true };
}

interface TraceSpan {
  name?: string;
  traceId?: string;
  spanId?: string;
  timestamp?: string;
  attributes?: Record<string, string | number | boolean | undefined>;
}

export async function observeCommand(options: {
  traces: string;
  out: string;
  system?: string;
}): Promise<number> {
  try {
    const tracesPath = path.resolve(options.traces);
    const outputPath = path.resolve(options.out);

    if (!fs.existsSync(tracesPath)) {
      console.error(`Error: Traces file not found: ${tracesPath}`);
      return 1;
    }

    // 1. Detect trace format (JSON array vs. JSONL)
    let spans: TraceSpan[] = [];
    let isJsonL = false;

    try {
      const rawHead = fs.readFileSync(tracesPath, 'utf8').trim();
      if (!rawHead.startsWith('[')) {
        isJsonL = true;
      } else {
        spans = JSON.parse(rawHead) as TraceSpan[];
      }
    } catch (error: unknown) {
      console.error(`Error checking trace file format: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }

    // 2. Setup Runtime Evidence collections
    const observed_agents: any[] = [];
    const observed_model_calls: any[] = [];
    const observed_tool_calls: any[] = [];
    const observed_delegations: any[] = [];
    const observed_mcp_calls: any[] = [];
    const observed_approval_events: any[] = [];
    const observed_identities: any[] = [];
    const observed_data_access: any[] = [];

    const processSpan = (span: TraceSpan) => {
      if (!span || typeof span !== 'object') return;
      const { name, traceId, spanId, timestamp, attributes } = span;
      if (!attributes) return;

      const agentId = attributes['gen_ai.agent.id'] as string | undefined;

      // Map Agent activations
      if (agentId) {
        // Only push agent activation if not already logged for this trace/span
        if (!observed_agents.some(a => a.agent_id === agentId && a.trace_id === traceId && a.span_id === spanId)) {
          observed_agents.push({
            agent_id: agentId,
            trace_id: traceId || 'unknown',
            span_id: spanId || 'unknown',
            timestamp: timestamp || new Date().toISOString()
          });
        }
      }

      // Map Model Calls
      if (name === 'agent.model_call' && agentId) {
        const modelId = attributes['gen_ai.model.id'] as string | undefined;
        if (modelId) {
          observed_model_calls.push({
            agent_id: agentId,
            model_id: modelId,
            trace_id: traceId || 'unknown',
            span_id: spanId || 'unknown',
            timestamp: timestamp || new Date().toISOString()
          });
        }
      }

      // Map Tool Calls
      if (name === 'agent.tool_call' && agentId) {
        const toolId = attributes['gen_ai.tool.id'] as string | undefined;
        if (toolId) {
          observed_tool_calls.push({
            agent_id: agentId,
            tool_id: toolId,
            trace_id: traceId || 'unknown',
            span_id: spanId || 'unknown',
            timestamp: timestamp || new Date().toISOString()
          });

          // MCP Server route mapping
          const mcpServerId = attributes['gen_ai.tool.mcp_server'] as string | undefined;
          if (mcpServerId) {
            observed_mcp_calls.push({
              agent_id: agentId,
              mcp_server_id: mcpServerId,
              tool_id: toolId,
              trace_id: traceId || 'unknown',
              span_id: spanId || 'unknown',
              timestamp: timestamp || new Date().toISOString()
            });
          }
        }
      }

      // Map Delegations
      if (name === 'agent.delegate' && agentId) {
        const delegateId = attributes['gen_ai.delegate.id'] as string | undefined;
        if (delegateId) {
          observed_delegations.push({
            agent_id: agentId,
            delegate_id: delegateId,
            trace_id: traceId || 'unknown',
            span_id: spanId || 'unknown',
            timestamp: timestamp || new Date().toISOString()
          });
        }
      }

      // Map Human approvals
      if (name === 'agent.approval' && agentId) {
        const toolId = attributes['gen_ai.tool.id'] as string | undefined;
        const approver = attributes['gen_ai.approval.approver'] as string | undefined;
        const decision = attributes['gen_ai.approval.decision'] as string | undefined;
        if (toolId && approver && (decision === 'approved' || decision === 'denied')) {
          observed_approval_events.push({
            agent_id: agentId,
            tool_id: toolId,
            approver,
            decision,
            trace_id: traceId || 'unknown',
            span_id: spanId || 'unknown',
            timestamp: timestamp || new Date().toISOString()
          });
        }
      }

      // Map Identity usage
      const identityId = attributes['gen_ai.identity.id'] as string | undefined;
      if (name === 'agent.identity_use' && identityId) {
        observed_identities.push({
          identity_id: identityId,
          trace_id: traceId || 'unknown',
          span_id: spanId || 'unknown',
          timestamp: timestamp || new Date().toISOString()
        });
      }

      // Map Data Class Access
      if (name === 'agent.data_access' && agentId) {
        const dataClassId = attributes['gen_ai.data_class.id'] as string | undefined;
        const accessType = attributes['gen_ai.data_access.type'] as string | undefined;
        if (dataClassId && (accessType === 'read' || accessType === 'write')) {
          observed_data_access.push({
            agent_id: agentId,
            data_class_id: dataClassId,
            access_type: accessType,
            trace_id: traceId || 'unknown',
            span_id: spanId || 'unknown',
            timestamp: timestamp || new Date().toISOString()
          });
        }
      }
    };

    if (isJsonL) {
      const fileStream = fs.createReadStream(tracesPath, 'utf8');
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        const span = JSON.parse(line) as TraceSpan;
        processSpan(span);
      }
    } else {
      spans.forEach(processSpan);
    }

    const evidence = {
      system: options.system || 'ObservedAgenticSystem',
      observed_at: new Date().toISOString(),
      source: 'otel',
      observed_agents,
      observed_model_calls,
      observed_tool_calls,
      observed_delegations,
      observed_mcp_calls,
      observed_approval_events,
      observed_identities,
      observed_data_access
    };

    // Validate the generated evidence against the schema to prove correctness
    const validation = validateRuntimeEvidence(evidence);
    if (!validation.valid) {
      console.error(`Error: Generated evidence is not schema-conforming:`);
      validation.errors?.forEach(err => console.error(`  - ${err}`));
      return 1;
    }

    fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(`Successfully generated and validated runtime evidence JSON at: ${outputPath}`);
    return 0;
  } catch (error: unknown) {
    console.error(`Error executing observe command: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
