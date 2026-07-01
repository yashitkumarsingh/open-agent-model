import { Agent, Tool } from '../core/model.js';

export function hasHumanApproval(agent: Agent, tool: Tool, toolId: string): boolean {
  const toolApprovalMode = tool.approval?.mode;

  return (
    tool.requires_human_approval === true ||
    toolApprovalMode === 'human' ||
    toolApprovalMode === 'multi-party' ||
    agent.autonomy === 'human-approval-required' ||
    agent.approval_required_for?.includes(toolId) === true
  );
}
