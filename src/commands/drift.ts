import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { validateYaml } from './validate.js';
import { SystemModel, Agent } from '../core/model.js';

interface DriftViolation {
  type: 'unauthorized_tool' | 'unauthorized_delegate';
  traceId: string;
  spanId: string;
  agentId: string;
  targetId: string;
  description: string;
}

interface TraceSpan {
  name?: string;
  traceId?: string;
  spanId?: string;
  attributes?: Record<string, string | number | boolean | undefined>;
}

export async function driftCommand(options: { input: string; traces: string }): Promise<number> {
  const inputPath = path.resolve(options.input);
  const tracesPath = path.resolve(options.traces);

  if (!fs.existsSync(inputPath)) {
    console.error(`\x1b[31mError: Agent model file not found at ${inputPath}\x1b[0m`);
    return 1;
  }

  if (!fs.existsSync(tracesPath)) {
    console.error(`\x1b[31mError: OpenTelemetry traces log file not found at ${tracesPath}\x1b[0m`);
    return 1;
  }

  // 1. Load and validate design model config
  const validation = validateYaml(inputPath);
  if (!validation.valid || !validation.data) {
    console.error(`\x1b[31mError: Invalid agent model configuration. Run 'oam validate' to debug.\x1b[0m`);
    return 1;
  }
  const data: SystemModel = validation.data;

  // Map agents by ID for fast $O(1)$ lookup
  const agentMap = new Map<string, Agent>();
  (data.agents || []).forEach((a) => {
    if (a.id) agentMap.set(a.id, a);
  });

  // 2. Parse traces. We support both JSON arrays and JSON Lines (JSONL) dynamically.
  let traceSpans: TraceSpan[] = [];
  let isJsonL = false;

  try {
    const rawHead = fs.readFileSync(tracesPath, 'utf8').trim();
    if (!rawHead.startsWith('[')) {
      isJsonL = true;
    } else {
      traceSpans = JSON.parse(rawHead) as TraceSpan[];
    }
  } catch (error: unknown) {
    console.error(`\x1b[31mError checking trace file format: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
    return 1;
  }

  const violations: DriftViolation[] = [];
  let totalSpans = 0;

  const processSpan = (span: TraceSpan) => {
    if (!span || typeof span !== 'object') return;
    totalSpans++;
    const { name, attributes, traceId, spanId } = span;
    if (!attributes) return;

    const agentId = attributes['gen_ai.agent.id'] as string | undefined;
    if (!agentId) return;

    const agent = agentMap.get(agentId);

    // Verify tool executions
    if (name === 'agent.tool_call') {
      const toolId = attributes['gen_ai.tool.id'] as string | undefined;
      if (toolId) {
        if (!agent) {
          violations.push({
            type: 'unauthorized_tool',
            traceId: traceId || 'unknown',
            spanId: spanId || 'unknown',
            agentId,
            targetId: toolId,
            description: `Execution Drift: Tool '${toolId}' was called by undeclared agent '${agentId}'.`
          });
        } else {
          const allowedTools = agent.allowed_tools || [];
          if (!allowedTools.includes(toolId)) {
            violations.push({
              type: 'unauthorized_tool',
              traceId: traceId || 'unknown',
              spanId: spanId || 'unknown',
              agentId,
              targetId: toolId,
              description: `Execution Drift: Agent '${agentId}' executed tool '${toolId}' which is NOT in its allowed_tools specification.`
            });
          }
        }
      }
    }

    // Verify delegations
    if (name === 'agent.delegate') {
      const delegateId = attributes['gen_ai.delegate.id'] as string | undefined;
      if (delegateId) {
        if (!agent) {
          violations.push({
            type: 'unauthorized_delegate',
            traceId: traceId || 'unknown',
            spanId: spanId || 'unknown',
            agentId,
            targetId: delegateId,
            description: `Delegation Drift: Delegation to '${delegateId}' was initiated by undeclared agent '${agentId}'.`
          });
        } else {
          const allowedDelegates = agent.allowed_delegates || [];
          if (!allowedDelegates.includes(delegateId)) {
            violations.push({
              type: 'unauthorized_delegate',
              traceId: traceId || 'unknown',
              spanId: spanId || 'unknown',
              agentId,
              targetId: delegateId,
              description: `Delegation Drift: Agent '${agentId}' delegated a task to '${delegateId}' which is NOT in its allowed_delegates specification.`
            });
          }
        }
      }
    }
  };

  // 3. Run validation pass
  if (isJsonL) {
    console.log(`Streaming JSONL traces for constant memory evaluation...`);
    try {
      const fileStream = fs.createReadStream(tracesPath, 'utf8');
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (!line.trim()) continue;
        const span = JSON.parse(line) as TraceSpan;
        processSpan(span);
      }
    } catch (error: unknown) {
      console.error(`\x1b[31mError streaming JSONL trace logs: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
      return 1;
    }
  } else {
    traceSpans.forEach((span) => processSpan(span));
  }

  console.log(`Analyzed ${totalSpans} OpenTelemetry trace spans against ${data.system} (v${data.version})...`);

  // 4. Report violations
  if (violations.length > 0) {
    console.error(`\n\x1b[31m✘ DRIFT DETECTED: Found ${violations.length} runtime policy violation(s)!\x1b[0m\n`);
    violations.forEach((v) => {
      const category = v.type === 'unauthorized_tool' ? 'UNAUTHORIZED TOOL' : 'UNAUTHORIZED DELEGATE';
      console.error(`\x1b[31;1m[${category}]\x1b[0m Trace: ${v.traceId} | Span: ${v.spanId}`);
      console.error(`  - Agent:  ${v.agentId}`);
      console.error(`  - Target: ${v.targetId}`);
      console.error(`  - Error:  ${v.description}\n`);
    });
    return 1;
  } else {
    console.log(`\n\x1b[32m✔ DRIFT GATE PASSED: All runtime traces conform to design specification.\x1b[0m\n`);
    return 0;
  }
}
