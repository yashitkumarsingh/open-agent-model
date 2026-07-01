import { 
  SystemModel, 
  Agent, 
  Tool, 
  McpServer, 
  DataClass,
  IdentityCatalogEntry
} from '../core/model.js';
import { evaluatePolicies } from './policy-evaluator.js';
import { hasHumanApproval } from './approval.js';

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

// 1. Rule: A2A Privilege Escalation (Transitive Multi-hop Delegation Checker)
const a2aPrivilegeEscalationRule: Rule = {
  id: 'R-001',
  name: 'Agent-to-Agent Privilege Escalation',
  severity: 'critical',
  owaspMapping: 'OWASP-10: System and Network Escalation',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];
    const tools = data.tools || [];
    const dataClasses = data.data_classes || [];

    const toolMap = new Map<string, Tool>();
    tools.forEach((t) => toolMap.set(t.id, t));

    const dataClassMap = new Map<string, DataClass>();
    dataClasses.forEach((d) => dataClassMap.set(d.id, d));

    const agentMap = new Map<string, Agent>();
    agents.forEach((a) => agentMap.set(a.id, a));

    agents.forEach((agent) => {
      // Traverse allowed delegation graph to find all transitively reachable agents
      const visited = new Set<string>();
      const queue: string[] = [];
      
      (agent.allowed_delegates || []).forEach((dId) => {
        if (!visited.has(dId)) {
          visited.add(dId);
          queue.push(dId);
        }
      });

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const currAgent = agentMap.get(currId);
        if (currAgent && currAgent.allowed_delegates) {
          currAgent.allowed_delegates.forEach((delId) => {
            if (!visited.has(delId)) {
              visited.add(delId);
              queue.push(delId);
            }
          });
        }
      }

      // Check each transitively reached delegate for privilege escalations
      visited.forEach((delegateId) => {
        const delegate = agentMap.get(delegateId);
        if (!delegate) return;

        const agentTools = new Set(agent.allowed_tools || []);
        const delegateTools = delegate.allowed_tools || [];

        // Check high-privilege tools access
        delegateTools.forEach((toolId: string) => {
          if (!agentTools.has(toolId)) {
            const tool = toolMap.get(toolId);
            if (tool && (tool.risk === 'high' || tool.risk === 'critical' || tool.type === 'payment_api' || hasHumanApproval(delegate, tool, toolId))) {
              findings.push({
                id: 'R-001-ESC',
                title: 'A2A Privilege Escalation Path Detected',
                severity: 'critical',
                agentId: agent.id,
                description: `Agent '${agent.id}' can transitively delegate to '${delegateId}' (who has access to high-privilege tool '${toolId}' which '${agent.id}' cannot call directly).`,
                recommendation: `Restrict delegation chains, or enforce human approval gates on critical actions.`,
                owaspMapping: 'OWASP-10: System and Network Escalation',
                context: { delegateId, toolId }
              });
            }
          }
        });

        // Check sensitive data classes exfiltration
        const agentDataClasses = new Set<string>();
        (agent.allowed_tools || []).forEach((tid: string) => {
          const t = toolMap.get(tid);
          if (t && t.data_classes) {
            t.data_classes.forEach((dc: string) => agentDataClasses.add(dc));
          }
        });
        if (agent.memory && agent.memory.contains) {
          agent.memory.contains.forEach((dc: string) => agentDataClasses.add(dc));
        }

        const delegateDataClasses = new Set<string>();
        delegateTools.forEach((tid: string) => {
          const t = toolMap.get(tid);
          if (t && t.data_classes) {
            t.data_classes.forEach((dc: string) => delegateDataClasses.add(dc));
          }
        });
        if (delegate.memory && delegate.memory.contains) {
          delegate.memory.contains.forEach((dc: string) => delegateDataClasses.add(dc));
        }

        delegateDataClasses.forEach((dcId) => {
          if (!agentDataClasses.has(dcId)) {
            const dc = dataClassMap.get(dcId);
            if (dc && (dc.sensitivity === 'high' || dc.sensitivity === 'critical')) {
              findings.push({
                id: 'R-001-DAT',
                title: 'Indirect Access to Sensitive Data via A2A Delegation',
                severity: 'critical',
                agentId: agent.id,
                description: `Agent '${agent.id}' can transitively delegate to '${delegateId}', granting indirect access to sensitive data class '${dcId}' (${dc.sensitivity} sensitivity) which '${agent.id}' cannot access directly.`,
                recommendation: `Restrict downstream delegation scopes or enforce data boundary filters.`,
                owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
                context: { delegateId, dataClassId: dcId }
              });
            }
          }
        });
      });
    });

    return findings;
  }
};

// 2. Rule: Autonomous execution of dangerous tool
const unapprovedDangerousToolRule: Rule = {
  id: 'R-002',
  name: 'Autonomous Dangerous Tool Execution',
  severity: 'high',
  owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];
    const tools = data.tools || [];

    const toolMap = new Map<string, Tool>();
    tools.forEach((t) => toolMap.set(t.id, t));

    agents.forEach((agent) => {
      const allowedTools = agent.allowed_tools || [];
      allowedTools.forEach((toolId: string) => {
        const tool = toolMap.get(toolId);
        if (tool) {
          const isDangerous = 
            tool.type === 'payment_api' || 
            tool.risk === 'high' || 
            tool.risk === 'critical' || 
            toolId.toLowerCase().includes('delete') || 
            toolId.toLowerCase().includes('refund');

          if (isDangerous) {
            if (!hasHumanApproval(agent, tool, toolId)) {
              findings.push({
                id: 'R-002-AUT',
                title: 'Autonomous Execution of Dangerous Tool',
                severity: 'high',
                agentId: agent.id,
                description: `Agent '${agent.id}' can execute high-risk/payment tool '${toolId}' without human approval or validation.`,
                recommendation: `Require human approval for tool '${toolId}' by setting 'requires_human_approval: true', setting 'approval.mode: human', or adding it to the agent's 'approval_required_for' list.`,
                owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
                context: { toolId }
              });
            }
          }
        }
      });
    });

    return findings;
  }
};

// 3. Rule: Agent touches PII + connects to external MCP
const piiExternalMcpRule: Rule = {
  id: 'R-003',
  name: 'PII Exfiltration via External MCP Boundary',
  severity: 'high',
  owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];
    const tools = data.tools || [];
    const mcpServers = data.mcp_servers || [];
    const dataClasses = data.data_classes || [];

    const toolMap = new Map<string, Tool>();
    tools.forEach((t) => toolMap.set(t.id, t));

    const dataClassMap = new Map<string, DataClass>();
    dataClasses.forEach((d) => dataClassMap.set(d.id, d));

    const toolMcpMap = new Map<string, McpServer>();
    mcpServers.forEach((mcp) => {
      if (mcp.exposes) {
        mcp.exposes.forEach((tid) => toolMcpMap.set(tid, mcp));
      }
    });

    agents.forEach((agent) => {
      let accessesPii = false;
      let connectsToExternalMcp = false;
      let offendingTool = '';
      let offendingMcp = '';

      const allowedTools = agent.allowed_tools || [];
      allowedTools.forEach((toolId: string) => {
        const tool = toolMap.get(toolId);
        if (tool && tool.data_classes) {
          tool.data_classes.forEach((dcId: string) => {
            const dc = dataClassMap.get(dcId);
            if (dc && (dc.classification === 'pii' || dcId.toLowerCase().includes('pii'))) {
              accessesPii = true;
              offendingTool = toolId;
            }
          });
        }

        const mcp = toolMcpMap.get(toolId);
        if (mcp && (mcp.trust_level === 'external' || mcp.trust_level === 'untrusted')) {
          connectsToExternalMcp = true;
          offendingMcp = mcp.id;
        }
      });

      if (agent.memory && agent.memory.contains) {
        agent.memory.contains.forEach((dcId: string) => {
          const dc = dataClassMap.get(dcId);
          if (dc && (dc.classification === 'pii' || dcId.toLowerCase().includes('pii'))) {
            accessesPii = true;
            offendingTool = 'vector-memory';
          }
        });
      }

      if (accessesPii && connectsToExternalMcp) {
        findings.push({
          id: 'R-003-EXF',
          title: 'Sensitive PII Exposed to External Integration Boundary',
          severity: 'high',
          agentId: agent.id,
          description: `Agent '${agent.id}' accesses PII (via '${offendingTool}') and connects to external/untrusted MCP server '${offendingMcp}'. This creates an exfiltration risk.`,
          recommendation: `Isolate external tool calls from sensitive agent memory, or implement an outbound data protection proxy (PII scrubbing) before hitting external MCP APIs.`,
          owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
          context: { toolId: offendingTool, mcpId: offendingMcp }
        });
      }
    });

    return findings;
  }
};

// 4. Rule: Vector memory write without poisoning protection
const memoryPoisoningRule: Rule = {
  id: 'R-004',
  name: 'Memory Poisoning Vulnerability',
  severity: 'high',
  owaspMapping: 'OWASP-3: Training Data Poisoning / Memory Poisoning',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];

    agents.forEach((agent) => {
      if (agent.memory && agent.memory.type !== 'none') {
        const writeAccess = agent.memory.write_access === true;
        const protectionEnabled = agent.memory.poisoning_protection === true;

        if (writeAccess && !protectionEnabled) {
          findings.push({
            id: 'R-004-POI',
            title: 'Memory Write Access Without Poisoning Protection',
            severity: 'high',
            agentId: agent.id,
            description: `Agent '${agent.id}' has write access to its '${agent.memory.type}' memory, but has no poisoning protection or input verification enabled. Malicious payloads could permanently compromise agent memory.`,
            recommendation: `Enable 'poisoning_protection: true' in agent memory settings and implement semantic guards or transactional rollback policies on long-term memory writes.`,
            owaspMapping: 'OWASP-3: Training Data Poisoning / Memory Poisoning'
          });
        }
      }
    });

    return findings;
  }
};

// 5. Rule: Unlimited retries and missing retry loop protection
const infiniteLoopsRule: Rule = {
  id: 'R-005',
  name: 'Execution Loop Vulnerability',
  severity: 'medium',
  owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];

    agents.forEach((agent) => {
      const policy = agent.retry_policy;
      if (!policy) {
        findings.push({
          id: 'R-005-MISS',
          title: 'Missing Retry and Loop Protection Policy',
          severity: 'medium',
          agentId: agent.id,
          description: `Agent '${agent.id}' does not define a retry policy. Defaults could result in execution loops or token spend runaways on API failures.`,
          recommendation: `Define 'retry_policy' with explicit 'max_retries' (e.g. 3-5) and 'loop_detection: true'.`,
          owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops'
        });
      } else {
        const maxRetries = policy.max_retries;
        const loopDetection = policy.loop_detection === true;

        if (maxRetries === undefined || maxRetries >= 10) {
          findings.push({
            id: 'R-005-MAX',
            title: 'Excessive Retry Limits Configured',
            severity: 'medium',
            agentId: agent.id,
            description: `Agent '${agent.id}' has excessive retry limits configured (${maxRetries === undefined ? 'unlimited' : maxRetries} retries). This can lead to cost runaways.`,
            recommendation: `Limit 'max_retries' to less than 10 (ideally between 3 and 5).`,
            owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops'
          });
        }

        if (!loopDetection) {
          findings.push({
            id: 'R-005-LOOP',
            title: 'Execution Loop Detection Disabled',
            severity: 'medium',
            agentId: agent.id,
            description: `Agent '${agent.id}' has loop detection disabled in its retry policy. Repetitive tool failures could trigger infinite execution loops.`,
            recommendation: `Enable 'loop_detection: true' in the agent's 'retry_policy'.`,
            owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops'
          });
        }
      }
    });

    return findings;
  }
};

// 6. Rule: Governance metadata and boundary hardening
const governanceHardeningRule: Rule = {
  id: 'R-006',
  name: 'Governance Metadata and Boundary Hardening',
  severity: 'high',
  owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
  check(data: SystemModel): Finding[] {
    const findings: Finding[] = [];
    const agents = data.agents || [];
    const tools = data.tools || [];
    const mcpServers = data.mcp_servers || [];
    const dataClasses = data.data_classes || [];
    const identities = data.identities || [];
    const models = data.models || [];

    const toolMap = new Map<string, Tool>();
    tools.forEach((tool) => toolMap.set(tool.id, tool));

    const identityMap = new Map<string, IdentityCatalogEntry>();
    identities.forEach((identity) => identityMap.set(identity.id, identity));

    const dataClassMap = new Map<string, DataClass>();
    dataClasses.forEach((dataClass) => dataClassMap.set(dataClass.id, dataClass));

    const isHighImpactTool = (tool: Tool): boolean => {
      return (
        tool.risk === 'critical' ||
        tool.type === 'payment_api' ||
        tool.side_effect === 'payout' ||
        tool.side_effect === 'system_alteration'
      );
    };

    const isWriteLikeTool = (tool: Tool): boolean => {
      return (
        tool.type === 'command_line' ||
        tool.type === 'write_file' ||
        tool.side_effect === 'external_write' ||
        tool.side_effect === 'payout' ||
        tool.side_effect === 'system_alteration'
      );
    };

    const collectAgentDataClasses = (agent: Agent): DataClass[] => {
      const ids = new Set<string>();

      (agent.allowed_tools || []).forEach((toolId) => {
        const tool = toolMap.get(toolId);
        (tool?.data_classes || []).forEach((dataClassId) => ids.add(dataClassId));
      });

      (agent.memory?.contains || []).forEach((dataClassId) => ids.add(dataClassId));

      return Array.from(ids)
        .map((dataClassId) => dataClassMap.get(dataClassId))
        .filter((dataClass): dataClass is DataClass => dataClass !== undefined);
    };

    tools.forEach((tool) => {
      if (isHighImpactTool(tool) && !tool.auth_identity) {
        findings.push({
          id: 'R-006-AUTH',
          title: 'High-Impact Tool Missing Auth Identity',
          severity: 'high',
          agentId: 'system',
          description: `Tool '${tool.id}' is high impact but does not declare an auth_identity.`,
          recommendation: `Bind tool '${tool.id}' to a declared identity and validate required scopes for that identity.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      }

      if (isHighImpactTool(tool) && !tool.rate_limit) {
        findings.push({
          id: 'R-006-RATE',
          title: 'High-Impact Tool Missing Rate Limit',
          severity: 'high',
          agentId: 'system',
          description: `Tool '${tool.id}' is high impact but does not define rate_limit.max_calls_per_task.`,
          recommendation: `Set a conservative rate_limit.max_calls_per_task for '${tool.id}'.`,
          owaspMapping: 'OWASP-4: Unbounded Consumption / Tool Abuse',
          context: { toolId: tool.id }
        });
      }

      if (tool.auth_identity && isHighImpactTool(tool)) {
        const identity = identityMap.get(tool.auth_identity);
        if (identity && !identity.owner) {
          findings.push({
            id: 'R-006-OWNER',
            title: 'High-Impact Tool Uses Ownerless Identity',
            severity: 'high',
            agentId: 'system',
            description: `Tool '${tool.id}' uses identity '${tool.auth_identity}', but that identity has no owner.`,
            recommendation: `Set identities[].owner for '${tool.auth_identity}' so escalation and rotation ownership is clear.`,
            owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
            context: { toolId: tool.id }
          });
        }
      }

      const approvalMode = tool.approval?.mode;
      const hasHumanMode = approvalMode === 'human' || approvalMode === 'multi-party';
      const approvalExpirySeconds = tool.approval?.expiry_seconds;
      if (hasHumanMode && !tool.approval?.approver_role) {
        findings.push({
          id: 'R-006-APPROVER',
          title: 'Human Approval Missing Approver Role',
          severity: 'high',
          agentId: 'system',
          description: `Tool '${tool.id}' declares approval.mode '${approvalMode}' but does not specify approver_role.`,
          recommendation: `Set approval.approver_role for '${tool.id}' to make the approval authority auditable.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      }

      if (hasHumanMode && approvalExpirySeconds === undefined) {
        findings.push({
          id: 'R-006-APPROVAL-EXPIRY',
          title: 'Human Approval Missing Expiry',
          severity: 'medium',
          agentId: 'system',
          description: `Tool '${tool.id}' declares human approval but does not set approval.expiry_seconds.`,
          recommendation: `Set approval.expiry_seconds for '${tool.id}' to bound approval replay windows.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      } else if (hasHumanMode && typeof approvalExpirySeconds === 'number' && approvalExpirySeconds > 3600) {
        findings.push({
          id: 'R-006-APPROVAL-EXPIRY',
          title: 'Human Approval Expiry Too Long',
          severity: 'medium',
          agentId: 'system',
          description: `Tool '${tool.id}' approval expiry is ${approvalExpirySeconds}s, which exceeds the 3600s recommended maximum.`,
          recommendation: `Lower approval.expiry_seconds for '${tool.id}' to 3600 seconds or less.`,
          owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
          context: { toolId: tool.id }
        });
      }
    });

    mcpServers.forEach((mcp) => {
      const externalBoundary = mcp.trust_level === 'external' || mcp.trust_level === 'untrusted';
      if (!externalBoundary) return;

      (mcp.exposes || []).forEach((toolId) => {
        const tool = toolMap.get(toolId);
        if (tool && isWriteLikeTool(tool)) {
          findings.push({
            id: 'R-006-MCP-SIDE-EFFECT',
            title: 'External MCP Exposes Write or Payout Tool',
            severity: 'critical',
            agentId: 'system',
            description: `External/untrusted MCP server '${mcp.id}' exposes side-effecting tool '${toolId}'.`,
            recommendation: `Move '${toolId}' behind an internal MCP boundary or replace it with a read-only façade.`,
            owaspMapping: 'OWASP-6: Sensitive Information Disclosure / Excessive Agency',
            context: { toolId, mcpId: mcp.id }
          });
        }
      });
    });

    agents.forEach((agent) => {
      const allowedTools = new Set(agent.allowed_tools || []);
      const deniedTools = new Set(agent.denied_tools || []);

      allowedTools.forEach((toolId) => {
        if (deniedTools.has(toolId)) {
          findings.push({
            id: 'R-006-ALLOW-DENY',
            title: 'Agent Allows and Denies Same Tool',
            severity: 'high',
            agentId: agent.id,
            description: `Agent '${agent.id}' lists tool '${toolId}' in both allowed_tools and denied_tools.`,
            recommendation: `Remove '${toolId}' from one of the lists so policy intent is unambiguous.`,
            owaspMapping: 'OWASP-8: Excessive Agency / Governance Control Failure',
            context: { toolId }
          });
        }
      });

      if (agent.autonomy === 'autonomous') {
        allowedTools.forEach((toolId) => {
          const tool = toolMap.get(toolId);
          if (tool && isWriteLikeTool(tool)) {
            findings.push({
              id: 'R-006-AUTONOMOUS-WRITE',
              title: 'Autonomous Agent Can Invoke Write or Command Tool',
              severity: 'critical',
              agentId: agent.id,
              description: `Autonomous agent '${agent.id}' can invoke side-effecting tool '${toolId}'.`,
              recommendation: `Move '${agent.id}' to supervised/human-approval-required autonomy or remove '${toolId}' from allowed_tools.`,
              owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
              context: { toolId }
            });
          }
        });
      }

      const agentDataClasses = collectAgentDataClasses(agent);
      const candidateModels = models.filter((model) => model.id === agent.model || model.allowed_for?.includes(agent.id));

      candidateModels.forEach((model) => {
        agentDataClasses.forEach((dataClass) => {
          if (model.data_retention === 'enabled' && dataClass.classification === 'pii') {
            findings.push({
              id: 'R-006-MODEL-RETENTION',
              title: 'Model Retention Enabled for PII-Handling Agent',
              severity: 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' handles PII data class '${dataClass.id}' while model '${model.id}' has data_retention enabled.`,
              recommendation: `Disable data retention for model '${model.id}' or route PII handling to a no-retention deployment.`,
              owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
              context: { dataClassId: dataClass.id }
            });
          }

          if ((model.risk === 'high' || model.risk === 'critical') && (dataClass.sensitivity === 'high' || dataClass.sensitivity === 'critical')) {
            findings.push({
              id: 'R-006-MODEL-RISK',
              title: 'High-Risk Model Handles High-Sensitivity Data',
              severity: 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' can use model '${model.id}' (${model.risk}) while handling '${dataClass.id}' (${dataClass.sensitivity}).`,
              recommendation: `Use a lower-risk model deployment for '${agent.id}' or add a documented policy exception with compensating controls.`,
              owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
              context: { dataClassId: dataClass.id }
            });
          }
        });
      });
    });

    const agentMap = new Map<string, Agent>();
    agents.forEach((agent) => agentMap.set(agent.id, agent));

    agents.forEach((agent) => {
      const visited = new Set<string>();
      const stack = [...(agent.allowed_delegates || [])];

      while (stack.length > 0) {
        const delegateId = stack.pop()!;
        if (delegateId === agent.id) {
          findings.push({
            id: 'R-006-DELEGATION-CYCLE',
            title: 'Delegation Cycle Detected',
            severity: 'high',
            agentId: agent.id,
            description: `Agent '${agent.id}' is part of a delegation cycle.`,
            recommendation: `Break the allowed_delegates cycle so delegated tasks have a bounded authority path.`,
            owaspMapping: 'OWASP-4: Execution Loops / Agent Delegation Cycle',
            context: { delegateId }
          });
          break;
        }

        if (visited.has(delegateId)) continue;
        visited.add(delegateId);

        const delegate = agentMap.get(delegateId);
        (delegate?.allowed_delegates || []).forEach((nextDelegateId) => stack.push(nextDelegateId));
      }
    });

    return findings;
  }
};

// 7. Rule: Custom declared policies validation
const customPoliciesRule: Rule = {
  id: 'R-007',
  name: 'Custom Declared Policies compliance',
  severity: 'high',
  owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
  check(data: SystemModel): Finding[] {
    return evaluatePolicies(data);
  }
};

// Rules Registry
export const RULES_REGISTRY: Rule[] = [
  a2aPrivilegeEscalationRule,
  unapprovedDangerousToolRule,
  piiExternalMcpRule,
  memoryPoisoningRule,
  infiniteLoopsRule,
  governanceHardeningRule,
  customPoliciesRule
];

export function runRiskChecks(data: SystemModel): Finding[] {
  const allFindings: Finding[] = [];
  
  RULES_REGISTRY.forEach((rule) => {
    try {
      const findings = rule.check(data);
      // Enforce the rule's primary severities/ids if not customized
      findings.forEach((f) => {
        if (!f.id.startsWith('R-')) {
          f.id = `${rule.id}-${f.id}`;
        }
      });
      allFindings.push(...findings);
    } catch (err: any) {
      console.error(`Error running rule '${rule.name}': ${err?.message || err}`);
    }
  });

  return allFindings;
}
