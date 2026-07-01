import { SystemModel, Agent, Tool, McpServer, DataClass, DeclarativePolicy } from '../core/model.js';
import type { Finding } from './rules/types.js';
import { hasHumanApproval } from './approval.js';

export function evaluatePolicies(data: SystemModel): Finding[] {
  const findings: Finding[] = [];
  const policies = data.policies || [];
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

  let findingCounter = 100; // Keep policy findings distinct (R-100+)
  const nextId = () => `R-${findingCounter++}`;

  policies.forEach((policy) => {
    // Check if policy is a string (backward compatibility)
    if (typeof policy === 'string') {
      // 1. Policy: max_cost_per_task_usd: <value>
      const costMatch = policy.match(/max_cost_per_task_usd:\s*([\d.]+)/);
      if (costMatch) {
        const maxAllowedCost = parseFloat(costMatch[1]);
        agents.forEach((agent) => {
          const spendLimit = agent.spend_limit;
          if (!spendLimit || spendLimit.max_cost_usd === undefined) {
            findings.push({
              id: nextId(),
              title: 'Policy Violation: Uncapped Spend Limit',
              severity: 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' lacks a configured 'max_cost_usd' budget limit, violating the custom policy limit of $${maxAllowedCost.toFixed(2)}.`,
              recommendation: `Define 'spend_limit.max_cost_usd' (equal to or less than $${maxAllowedCost.toFixed(2)}) for Agent '${agent.id}'.`,
              owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval'
            });
          } else if (spendLimit.max_cost_usd > maxAllowedCost) {
            findings.push({
              id: nextId(),
              title: 'Policy Violation: Cost Budget Exceeded',
              severity: 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' configured spend budget ($${spendLimit.max_cost_usd.toFixed(2)}) exceeds the maximum custom policy allowance of $${maxAllowedCost.toFixed(2)}.`,
              recommendation: `Reduce 'spend_limit.max_cost_usd' on Agent '${agent.id}' to be at or below $${maxAllowedCost.toFixed(2)}.`,
              owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval'
            });
          }
        });
      }

      // 2. Policy: max_tool_calls_per_task: <value>
      const limitMatch = policy.match(/max_tool_calls_per_task:\s*(\d+)/);
      if (limitMatch) {
        const maxAllowedCalls = parseInt(limitMatch[1], 10);
        agents.forEach((agent) => {
          const retryPolicy = agent.retry_policy;
          if (!retryPolicy || retryPolicy.max_retries === undefined) {
            findings.push({
              id: nextId(),
              title: 'Policy Violation: Uncapped Execution Retries',
              severity: 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' does not specify 'max_retries' limits, violating the custom loop execution policy limit of ${maxAllowedCalls} calls.`,
              recommendation: `Add 'retry_policy.max_retries' (equal to or less than ${maxAllowedCalls}) to Agent '${agent.id}'.`,
              owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops'
            });
          } else if (retryPolicy.max_retries > maxAllowedCalls) {
            findings.push({
              id: nextId(),
              title: 'Policy Violation: Max Tool Calls Exceeded',
              severity: 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' maximum retries (${retryPolicy.max_retries}) exceeds the custom policy allowance of ${maxAllowedCalls} calls.`,
              recommendation: `Reduce 'retry_policy.max_retries' on Agent '${agent.id}' to be at or below ${maxAllowedCalls}.`,
              owaspMapping: 'OWASP-4: Model Denial of Service / Execution Loops'
            });
          }
        });
      }

      // 3. Policy: no_external_mcp_can_access_payment_tokens
      if (policy === 'no_external_mcp_can_access_payment_tokens') {
        mcpServers.forEach((mcp) => {
          const isExternal = mcp.trust_level === 'external' || mcp.trust_level === 'untrusted';
          if (isExternal && mcp.exposes) {
            mcp.exposes.forEach((toolId) => {
              const tool = toolMap.get(toolId);
              if (tool && tool.data_classes) {
                tool.data_classes.forEach((dcId) => {
                  const dc = dataClassMap.get(dcId);
                  if (dc && (dc.classification === 'credentials' || dcId.toLowerCase().includes('token'))) {
                    findings.push({
                      id: nextId(),
                      title: 'Policy Violation: External MCP Accesses Credentials',
                      severity: 'critical',
                      agentId: 'system',
                      description: `External/untrusted MCP Server '${mcp.id}' exposes tool '${toolId}' which accesses sensitive token/credentials data class '${dcId}', violating the strict isolation policy.`,
                      recommendation: `Revoke the exposure of tool '${toolId}' on MCP Server '${mcp.id}', or migrate the server trust level to 'internal'.`,
                      owaspMapping: 'OWASP-6: Sensitive Information Disclosure',
                      context: { toolId, mcpId: mcp.id, dataClassId: dcId }
                    });
                  }
                });
              }
            });
          }
        });
      }

      // 4. Policy: no_agent_can_issue_refund_without_human_approval
      if (policy === 'no_agent_can_issue_refund_without_human_approval') {
        agents.forEach((agent) => {
          const allowedTools = agent.allowed_tools || [];
          allowedTools.forEach((toolId) => {
            if (toolId.toLowerCase().includes('refund')) {
              const tool = toolMap.get(toolId);
              if (tool && !hasHumanApproval(agent, tool, toolId)) {
                findings.push({
                  id: nextId(),
                  title: 'Policy Violation: Unapproved Refund Capability',
                  severity: 'critical',
                  agentId: agent.id,
                  description: `Agent '${agent.id}' can invoke refund capability tool '${toolId}' without human approval, violating the system-wide refund gate policy.`,
                  recommendation: `Add '${toolId}' to Agent '${agent.id}' 'approval_required_for' list, or set 'requires_human_approval: true' on tool '${toolId}'.`,
                  owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
                  context: { toolId }
                });
              }
            }
          });
        });
      }
    } else {
      // Handle structured DeclarativePolicy object
      const decPolicy = policy as DeclarativePolicy;
      const targetAutonomy = decPolicy.when?.['agent.autonomy'];
      const targetToolRisk = decPolicy.when?.['tool.risk'];

      const requiredHumanApproval = decPolicy.require?.['tool.requires_human_approval'];
      const maxSpendCost = decPolicy.require?.['agent.spend_limit.max_cost_usd'];

      agents.forEach((agent) => {
        // Filter by agent autonomy if specified
        if (targetAutonomy && agent.autonomy !== targetAutonomy) return;

        // Check spend limits
        if (maxSpendCost !== undefined) {
          const spend = agent.spend_limit;
          if (!spend || spend.max_cost_usd === undefined) {
            findings.push({
              id: nextId(),
              title: `Policy Violation: Uncapped Spend Limit [${decPolicy.id}]`,
              severity: decPolicy.severity || 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' lacks a spend limit, violating policy '${decPolicy.id}' requiring max $${maxSpendCost}.`,
              recommendation: `Set 'spend_limit.max_cost_usd' to $${maxSpendCost} or less.`,
              owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval'
            });
          } else if (spend.max_cost_usd > maxSpendCost) {
            findings.push({
              id: nextId(),
              title: `Policy Violation: Cost Limit Exceeded [${decPolicy.id}]`,
              severity: decPolicy.severity || 'high',
              agentId: agent.id,
              description: `Agent '${agent.id}' budget $${spend.max_cost_usd} exceeds policy limit of $${maxSpendCost}.`,
              recommendation: `Reduce spend_limit.max_cost_usd to $${maxSpendCost} or less.`,
              owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval'
            });
          }
        }

        // Check tool boundaries
        const allowedTools = agent.allowed_tools || [];
        allowedTools.forEach((toolId) => {
          const tool = toolMap.get(toolId);
          if (!tool) return;

          // Filter by tool risk if specified
          if (targetToolRisk && tool.risk !== targetToolRisk) return;

          // Check requires human approval
          if (requiredHumanApproval === true) {
            if (!hasHumanApproval(agent, tool, toolId)) {
              findings.push({
                id: nextId(),
                title: `Policy Violation: Unapproved Critical Tool Execution [${decPolicy.id}]`,
                severity: decPolicy.severity || 'high',
                agentId: agent.id,
                description: `Agent '${agent.id}' can invoke tool '${toolId}' without human approval, violating policy '${decPolicy.id}'.`,
                recommendation: `Add human approval gate on tool '${toolId}' or in Agent '${agent.id}' 'approval_required_for'.`,
                owaspMapping: 'OWASP-8: Excessive Agency / Autonomy without Approval',
                context: { toolId }
              });
            }
          }
        });
      });
    }
  });

  return findings;
}
