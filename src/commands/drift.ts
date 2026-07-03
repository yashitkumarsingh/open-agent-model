import fs from 'fs';
import path from 'path';
import { validateYaml } from './validate.js';
import { SystemModel } from '../core/model.js';
import { observeCommand, validateRuntimeEvidence } from './observe.js';

interface DriftViolation {
  severity: 'medium' | 'high' | 'critical';
  type: string;
  traceId: string;
  spanId: string;
  description: string;
}

export async function driftCommand(options: {
  input: string;
  evidence?: string;
  traces?: string;
  failOn?: string;
}): Promise<number> {
  const inputPath = path.resolve(options.input);
  const failThreshold = (options.failOn || 'high').toLowerCase() as 'medium' | 'high' | 'critical';

  if (!fs.existsSync(inputPath)) {
    console.error(`\x1b[31mError: Agent model file not found at ${inputPath}\x1b[0m`);
    return 1;
  }

  // 1. Load and validate design model config
  const validation = validateYaml(inputPath);
  if (!validation.valid || !validation.data) {
    console.error(`\x1b[31mError: Invalid agent model configuration. Run 'oam validate' to debug.\x1b[0m`);
    if (validation.errors) {
      validation.errors.forEach(err => console.error(`  - Validation error: ${err}`));
    }
    return 1;
  }
  const data: SystemModel = validation.data;

  // 2. Load or process runtime evidence data
  let evidenceData: any;

  if (options.evidence) {
    const evidencePath = path.resolve(options.evidence);
    if (!fs.existsSync(evidencePath)) {
      console.error(`\x1b[31mError: Evidence file not found at ${evidencePath}\x1b[0m`);
      return 1;
    }
    try {
      const content = fs.readFileSync(evidencePath, 'utf8');
      evidenceData = JSON.parse(content);
    } catch (e: unknown) {
      console.error(`\x1b[31mError parsing evidence JSON file: ${e instanceof Error ? e.message : String(e)}\x1b[0m`);
      return 1;
    }
    const evVal = validateRuntimeEvidence(evidenceData);
    if (!evVal.valid) {
      console.error(`\x1b[31mError: Invalid runtime evidence file schema.\x1b[0m`);
      evVal.errors?.forEach(err => console.error(`  - ${err}`));
      return 1;
    }
  } else if (options.traces) {
    const tracesPath = path.resolve(options.traces);
    if (!fs.existsSync(tracesPath)) {
      console.error(`\x1b[31mError: OpenTelemetry traces log file not found at ${tracesPath}\x1b[0m`);
      return 1;
    }
    const tempEvidenceFile = path.join(path.dirname(tracesPath), `.drift-temp-evidence-${Date.now()}.json`);
    const code = await observeCommand({ traces: options.traces, out: tempEvidenceFile, system: data.system });
    if (code !== 0) {
      console.error(`\x1b[31mError: Failed to process raw traces into runtime evidence.\x1b[0m`);
      return 1;
    }
    try {
      const content = fs.readFileSync(tempEvidenceFile, 'utf8');
      evidenceData = JSON.parse(content);
    } finally {
      if (fs.existsSync(tempEvidenceFile)) {
        fs.unlinkSync(tempEvidenceFile);
      }
    }
  } else {
    console.error(`\x1b[31mError: Either --evidence (-e) or --traces (-t) must be specified for drift detection.\x1b[0m`);
    return 1;
  }

  // 3. Perform drift checks
  const violations: DriftViolation[] = [];

  // Index agents and tools
  const agentMap = new Map<string, any>();
  (data.agents || []).forEach(a => { if (a.id) agentMap.set(a.id, a); });

  const toolMap = new Map<string, any>();
  (data.tools || []).forEach(t => { if (t.id) toolMap.set(t.id, t); });

  const identityMap = new Map<string, any>();
  (data.identities || []).forEach(id => { if (id.id) identityMap.set(id.id, id); });

  // A. Check Agents
  (evidenceData.observed_agents || []).forEach((oa: any) => {
    if (!agentMap.has(oa.agent_id)) {
      violations.push({
        severity: 'high',
        type: 'unauthorized_agent',
        traceId: oa.trace_id,
        spanId: oa.span_id,
        description: `Execution Drift: Agent '${oa.agent_id}' is invoked but is not declared in design model.`
      });
    }
  });

  // B. Check Models
  (evidenceData.observed_model_calls || []).forEach((om: any) => {
    const agent = agentMap.get(om.agent_id);
    if (agent && agent.model !== om.model_id) {
      violations.push({
        severity: 'medium',
        type: 'model_mismatch',
        traceId: om.trace_id,
        spanId: om.span_id,
        description: `Model Drift: Agent '${om.agent_id}' used model '${om.model_id}', but design model binds it to '${agent.model}'.`
      });
    }
  });

  // C. Check Tools
  (evidenceData.observed_tool_calls || []).forEach((ot: any) => {
    const agent = agentMap.get(ot.agent_id);
    if (!toolMap.has(ot.tool_id)) {
      violations.push({
        severity: 'high',
        type: 'unauthorized_tool',
        traceId: ot.trace_id,
        spanId: ot.span_id,
        description: `Tool Drift: Undeclared tool '${ot.tool_id}' was called by agent '${ot.agent_id}'.`
      });
    } else if (agent) {
      const allowed = agent.allowed_tools || [];
      if (!allowed.includes(ot.tool_id)) {
        violations.push({
          severity: 'high',
          type: 'unauthorized_tool',
          traceId: ot.trace_id,
          spanId: ot.span_id,
          description: `Authorization Drift: Agent '${ot.agent_id}' executed tool '${ot.tool_id}' which is not in its allowed_tools specification.`
        });
      }
    }
  });

  // D. Check Delegations
  (evidenceData.observed_delegations || []).forEach((od: any) => {
    const agent = agentMap.get(od.agent_id);
    if (agent) {
      const allowed = agent.allowed_delegates || [];
      if (!allowed.includes(od.delegate_id)) {
        violations.push({
          severity: 'high',
          type: 'unauthorized_delegate',
          traceId: od.trace_id,
          spanId: od.span_id,
          description: `Delegation Drift: Agent '${od.agent_id}' delegated to agent '${od.delegate_id}' which is not in its allowed_delegates specification.`
        });
      }
    }
  });

  // E. Check MCP Calls
  (evidenceData.observed_mcp_calls || []).forEach((omc: any) => {
    const tool = toolMap.get(omc.tool_id);
    if (tool) {
      const expectedServer = tool.source?.mcp_server;
      if (expectedServer !== omc.mcp_server_id) {
        violations.push({
          severity: 'high',
          type: 'mcp_server_drift',
          traceId: omc.trace_id,
          spanId: omc.span_id,
          description: `MCP Drift: Tool '${omc.tool_id}' was executed on MCP server '${omc.mcp_server_id}' instead of declared '${expectedServer || 'none'}'.`
        });
      }
    }
  });

  // F. Check Data Access
  (evidenceData.observed_data_access || []).forEach((oda: any) => {
    const agent = agentMap.get(oda.agent_id);
    if (agent) {
      const memoryClasses = agent.memory?.contains || [];
      if (oda.access_type === 'write' && !agent.memory?.write_access) {
        violations.push({
          severity: 'high',
          type: 'unauthorized_data_write',
          traceId: oda.trace_id,
          spanId: oda.span_id,
          description: `Data Access Drift: Agent '${oda.agent_id}' performed write access to data class '${oda.data_class_id}' but write_access is disabled.`
        });
      } else if (!memoryClasses.includes(oda.data_class_id)) {
        let allowedByTool = false;
        (data.tools || []).forEach(t => {
          if (agent.allowed_tools?.includes(t.id) && t.data_classes?.includes(oda.data_class_id)) {
            allowedByTool = true;
          }
        });
        if (!allowedByTool) {
          violations.push({
            severity: 'high',
            type: 'unauthorized_data_access',
            traceId: oda.trace_id,
            spanId: oda.span_id,
            description: `Data Access Drift: Agent '${oda.agent_id}' accessed data class '${oda.data_class_id}' which is not registered in its memory or tools catalog.`
          });
        }
      }
    }
  });

  // G. Check Identity Expiry
  (evidenceData.observed_identities || []).forEach((oi: any) => {
    const identity = identityMap.get(oi.identity_id);
    if (identity && identity.expires_at) {
      const expiry = new Date(identity.expires_at).getTime();
      const observedTime = oi.timestamp ? new Date(oi.timestamp).getTime() : Date.now();
      if (observedTime > expiry) {
        violations.push({
          severity: 'medium',
          type: 'expired_identity_use',
          traceId: oi.trace_id,
          spanId: oi.span_id,
          description: `Identity Drift: Expired identity '${oi.identity_id}' was used at runtime.`
        });
      }
    }
  });

  // H. Check approvals for critical/requires_approval tools
  const approvalsByTrace = new Map<string, Set<string>>();
  (evidenceData.observed_approval_events || []).forEach((ae: any) => {
    if (ae.decision === 'approved') {
      if (!approvalsByTrace.has(ae.trace_id)) {
        approvalsByTrace.set(ae.trace_id, new Set());
      }
      approvalsByTrace.get(ae.trace_id)!.add(ae.tool_id);
    }
  });

  (evidenceData.observed_tool_calls || []).forEach((ot: any) => {
    const tool = toolMap.get(ot.tool_id);
    if (tool && (tool.risk === 'critical' || tool.requires_human_approval || tool.approval?.mode === 'human')) {
      const traceApprovedTools = approvalsByTrace.get(ot.trace_id);
      if (!traceApprovedTools || !traceApprovedTools.has(ot.tool_id)) {
        violations.push({
          severity: 'critical',
          type: 'missing_human_approval',
          traceId: ot.trace_id,
          spanId: ot.span_id,
          description: `Assurance Drift: Critical tool '${ot.tool_id}' was invoked without human-in-the-loop approval evidence in trace '${ot.trace_id}'.`
        });
      }
    }
  });

  console.log(`Analyzed runtime evidence against design model ${data.system} (v${data.version})...`);

  // 4. Report violations and verify threshold gating
  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const highCount = violations.filter(v => v.severity === 'high').length;
  const mediumCount = violations.filter(v => v.severity === 'medium').length;

  if (violations.length > 0) {
    console.error(`\n\x1b[31m✘ DRIFT DETECTED: Found ${violations.length} runtime policy violation(s):\x1b[0m`);
    violations.forEach((v) => {
      let color = '\x1b[33m';
      if (v.severity === 'critical') color = '\x1b[31;1m';
      else if (v.severity === 'high') color = '\x1b[31m';
      console.error(`${color}[${v.severity.toUpperCase()} - ${v.type.toUpperCase()}]\x1b[0m Trace: ${v.traceId} | Span: ${v.spanId}`);
      console.error(`  - Error: ${v.description}\n`);
    });

    let failedGate = false;
    if (failThreshold === 'critical' && criticalCount > 0) failedGate = true;
    if (failThreshold === 'high' && (criticalCount > 0 || highCount > 0)) failedGate = true;
    if (failThreshold === 'medium' && (criticalCount > 0 || highCount > 0 || mediumCount > 0)) failedGate = true;

    if (failedGate) {
      console.error(`\x1b[31m✘ DRIFT GATE FAILED: Runtime violations exceeded --fail-on ${failThreshold} threshold!\x1b[0m\n`);
      return 1;
    }
  }

  console.log(`\x1b[32m✔ DRIFT GATE PASSED: Runtime behaviour matches design constraints.\x1b[0m\n`);
  return 0;
}
