import fs from 'fs';
import path from 'path';
import { validateYaml } from './validate.js';
import { runRiskChecks } from '../risk-engine/rules/index.js';
import { SystemModel, Agent, Tool, McpServer, DataClass } from '../core/model.js';

interface GraphNode {
  id: string;
  label: string;
  type: 'agent' | 'tool' | 'mcp' | 'dataclass';
  x: number;
  y: number;
  details: unknown;
}

export function generateSvgDiagram(data: SystemModel): string {
  const width = 1100;
  const height = 650;
  const padding = 80;

  const agents = data.agents || [];
  const tools = data.tools || [];
  const mcpServers = data.mcp_servers || [];
  const dataClasses = data.data_classes || [];

  const dataClassMap = new Map<string, DataClass>();
  dataClasses.forEach((d: DataClass) => dataClassMap.set(d.id, d));

  // Run risk checks to highlight specific risk paths
  const findings = runRiskChecks(data);
  const criticalA2APaths = new Set<string>(); // "agentId->delegateId"
  const unapprovedTools = new Set<string>(); // "agentId->toolId"
  const piiExfilAgents = new Set<string>();

  findings.forEach(f => {
    if (f.context) {
      if (f.severity === 'critical' && f.context.delegateId) {
        criticalA2APaths.add(`${f.agentId}->${f.context.delegateId}`);
      }
      if (f.severity === 'high' && f.context.toolId && !f.context.mcpId) {
        unapprovedTools.add(`${f.agentId}->${f.context.toolId}`);
      }
      if (f.severity === 'high' && f.context.mcpId) {
        piiExfilAgents.add(f.agentId);
      }
    }
  });

  const nodes: GraphNode[] = [];
  const nodeMap = new Map<string, GraphNode>();

  // Determine vertical positioning for each column
  const mcpCount = mcpServers.length;
  const agentCount = agents.length;
  const toolCount = tools.length;
  const dcCount = dataClasses.length;

  const calculateY = (index: number, count: number) => {
    if (count <= 1) return height / 2;
    return padding + (index * (height - 2 * padding)) / (count - 1);
  };

  // Column 1: MCP Servers (X = 100)
  mcpServers.forEach((mcp: McpServer, idx: number) => {
    const node: GraphNode = {
      id: mcp.id,
      label: mcp.id,
      type: 'mcp',
      x: 120,
      y: calculateY(idx, mcpCount),
      details: mcp
    };
    nodes.push(node);
    nodeMap.set(mcp.id, node);
  });

  // Column 2: Agents (X = 450)
  agents.forEach((agent: Agent, idx: number) => {
    const node: GraphNode = {
      id: agent.id,
      label: agent.id,
      type: 'agent',
      x: 450,
      y: calculateY(idx, agentCount),
      details: agent
    };
    nodes.push(node);
    nodeMap.set(agent.id, node);
  });

  // Column 3: Tools (X = 780)
  tools.forEach((tool: Tool, idx: number) => {
    const node: GraphNode = {
      id: tool.id,
      label: tool.id,
      type: 'tool',
      x: 780,
      y: calculateY(idx, toolCount),
      details: tool
    };
    nodes.push(node);
    nodeMap.set(tool.id, node);
  });

  // Column 4: Data Classes (X = 980)
  dataClasses.forEach((dc: DataClass, idx: number) => {
    const node: GraphNode = {
      id: dc.id,
      label: dc.id,
      type: 'dataclass',
      x: 980,
      y: calculateY(idx, dcCount),
      details: dc
    };
    nodes.push(node);
    nodeMap.set(dc.id, node);
  });

  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" style="background-color: #0b0f19; font-family: 'Outfit', 'Inter', sans-serif;">
  <defs>
    <!-- Grid Pattern -->
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#ffffff" stroke-opacity="0.03" stroke-width="1"/>
    </pattern>

    <!-- Node Glow Effects -->
    <filter id="glow-critical" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#ef4444" flood-opacity="0.6"/>
    </filter>
    <filter id="glow-high" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#f97316" flood-opacity="0.5"/>
    </filter>
    <filter id="glow-agent" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#8b5cf6" flood-opacity="0.4"/>
    </filter>

    <!-- Arrow Markers -->
    <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#4b5563"/>
    </marker>
    <marker id="arrow-danger" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444"/>
    </marker>
    <marker id="arrow-delegate" viewBox="0 0 10 10" refX="26" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#a855f7"/>
    </marker>
  </defs>

  <!-- Background Grid -->
  <rect width="100%" height="100%" fill="url(#grid)" />

  <!-- Trust Zones / Boundaries -->
  <!-- External Trust Boundary -->
  <rect x="20" y="40" width="220" height="${height - 80}" rx="12" fill="#ef4444" fill-opacity="0.02" stroke="#ef4444" stroke-opacity="0.2" stroke-width="1.5" stroke-dasharray="6 4" />
  <text x="30" y="32" fill="#ef4444" font-size="11" font-weight="700" letter-spacing="1">UNTRUSTED / EXTERNAL ZONE</text>

  <!-- Internal Trust Boundary -->
  <rect x="280" y="40" width="800" height="${height - 80}" rx="12" fill="#10b981" fill-opacity="0.01" stroke="#10b981" stroke-opacity="0.15" stroke-width="1.5" />
  <text x="290" y="32" fill="#10b981" font-size="11" font-weight="700" letter-spacing="1">INTERNAL SECURE ZONE</text>

  <!-- CONNECTIONS / EDGES -->
  <g id="edges">
  `;

  // Draw MCP to Tool exposing lines
  mcpServers.forEach((mcp: McpServer) => {
    const mcpNode = nodeMap.get(mcp.id);
    if (mcpNode && mcp.exposes) {
      mcp.exposes.forEach((toolId: string) => {
        const toolNode = nodeMap.get(toolId);
        if (toolNode) {
          const isExternal = mcp.trust_level === 'external' || mcp.trust_level === 'untrusted';
          const strokeColor = isExternal ? '#f97316' : '#4b5563';
          const dash = isExternal ? '4 3' : 'none';
          const opacity = isExternal ? 0.7 : 0.4;
          
          svgContent += `
    <!-- MCP Exposes Tool -->
    <path d="M ${mcpNode.x} ${mcpNode.y} C ${mcpNode.x + 100} ${mcpNode.y}, ${toolNode.x - 100} ${toolNode.y}, ${toolNode.x} ${toolNode.y}" 
          fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="${dash}" stroke-opacity="${opacity}" />`;
        }
      });
    }
  });

  // Draw Agent to Tool allowed tools lines
  agents.forEach((agent: Agent) => {
    const agentNode = nodeMap.get(agent.id);
    if (agentNode && agent.allowed_tools) {
      agent.allowed_tools.forEach((toolId: string) => {
        const toolNode = nodeMap.get(toolId);
        if (toolNode) {
          const isDanger = unapprovedTools.has(`${agent.id}->${toolId}`);
          const strokeColor = isDanger ? '#ef4444' : '#64748b';
          const strokeWidth = isDanger ? '2.5' : '1.5';
          const marker = isDanger ? 'url(#arrow-danger)' : 'url(#arrow)';
          const opacity = isDanger ? 0.9 : 0.5;

          svgContent += `
    <!-- Agent Call Tool -->
    <path d="M ${agentNode.x} ${agentNode.y} C ${agentNode.x + 120} ${agentNode.y}, ${toolNode.x - 120} ${toolNode.y}, ${toolNode.x} ${toolNode.y}" 
          fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" marker-end="${marker}" stroke-opacity="${opacity}" />`;
          
          if (isDanger) {
            // Draw a warning badge on the line
            const midX = (agentNode.x + toolNode.x) / 2;
            const midY = (agentNode.y + toolNode.y) / 2;
            svgContent += `
    <circle cx="${midX}" cy="${midY}" r="9" fill="#ef4444" />
    <text x="${midX}" y="${midY + 3}" fill="#ffffff" font-size="9" font-weight="900" text-anchor="middle">!</text>`;
          }
        }
      });
    }
  });

  // Draw Tool to Data Class lines
  tools.forEach((tool: Tool) => {
    const toolNode = nodeMap.get(tool.id);
    if (toolNode && tool.data_classes) {
      tool.data_classes.forEach((dcId: string) => {
        const dcNode = nodeMap.get(dcId);
        if (dcNode) {
          const dc = dataClassMap.get(dcId);
          const isSensitive = dc && (dc.sensitivity === 'high' || dc.sensitivity === 'critical');
          const strokeColor = isSensitive ? '#f59e0b' : '#334155';
          
          svgContent += `
    <!-- Tool accesses Data -->
    <path d="M ${toolNode.x} ${toolNode.y} C ${toolNode.x + 80} ${toolNode.y}, ${dcNode.x - 80} ${dcNode.y}, ${dcNode.x} ${dcNode.y}" 
          fill="none" stroke="${strokeColor}" stroke-width="1" stroke-opacity="0.5" />`;
        }
      });
    }
  });

  // Draw Agent to Agent (A2A) delegation lines
  agents.forEach((agent: Agent) => {
    const agentNode = nodeMap.get(agent.id);
    if (agentNode && agent.allowed_delegates) {
      agent.allowed_delegates.forEach((delegateId: string) => {
        const delNode = nodeMap.get(delegateId);
        if (delNode) {
          const isCritical = criticalA2APaths.has(`${agent.id}->${delegateId}`);
          const strokeColor = isCritical ? '#ef4444' : '#a855f7';
          const strokeWidth = isCritical ? '2.5' : '2';
          const marker = isCritical ? 'url(#arrow-danger)' : 'url(#arrow-delegate)';
          
          // Draw curved arch connecting agents
          const dx = delNode.x - agentNode.x;
          const dy = delNode.y - agentNode.y;
          const hx1 = agentNode.x + dx * 0.25 - dy * 0.3;
          const hy1 = agentNode.y + dy * 0.25 + dx * 0.3;
          const hx2 = agentNode.x + dx * 0.75 - dy * 0.3;
          const hy2 = agentNode.y + dy * 0.75 + dx * 0.3;

          svgContent += `
    <!-- A2A Delegation -->
    <path d="M ${agentNode.x} ${agentNode.y} C ${hx1} ${hy1}, ${hx2} ${hy2}, ${delNode.x} ${delNode.y}" 
          fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="5 3" marker-end="${marker}" />`;
          
          if (isCritical) {
            const midX = (hx1 + hx2) / 2;
            const midY = (hy1 + hy2) / 2;
            svgContent += `
    <circle cx="${midX}" cy="${midY}" r="10" fill="#ef4444" filter="url(#glow-critical)" />
    <text x="${midX}" y="${midY + 3}" fill="#ffffff" font-size="10" font-weight="900" text-anchor="middle">⚠</text>`;
          }
        }
      });
    }
  });

  svgContent += `
  </g>

  <!-- NODES / BLOCKS -->
  <g id="nodes">
  `;

  // Draw nodes
  nodes.forEach((node) => {
    if (node.type === 'agent') {
      const details = node.details as Agent;
      const isPiiOffender = piiExfilAgents.has(node.id);
      const isApprovalReq = details.autonomy === 'human-approval-required';
      
      let border = '#8b5cf6';
      let fill = '#1e1b4b';
      let filter = 'url(#glow-agent)';
      
      if (isPiiOffender) {
        border = '#f97316';
        fill = '#2c1a10';
        filter = 'url(#glow-high)';
      }

      svgContent += `
    <!-- Agent: ${node.id} -->
    <g transform="translate(${node.x - 75}, ${node.y - 30})">
      <rect width="150" height="60" rx="10" fill="${fill}" stroke="${border}" stroke-width="2" filter="${filter}" />
      <text x="75" y="24" fill="#f3e8ff" font-size="12" font-weight="800" text-anchor="middle">${node.label}</text>
      <text x="75" y="38" fill="#a78bfa" font-size="9" text-anchor="middle">${details.framework || 'unknown'}</text>
      <text x="75" y="49" fill="#93c5fd" font-size="8" font-weight="600" letter-spacing="0.5" text-anchor="middle">${(details.autonomy || 'supervised').toUpperCase()}</text>
      ${isApprovalReq ? `
      <!-- Approval Shield -->
      <g transform="translate(132, -8)">
        <polygon points="8,0 16,3 13,12 8,15 3,12 0,3" fill="#eab308" />
        <text x="8" y="10" fill="#000000" font-size="7" font-weight="900" text-anchor="middle">✔</text>
      </g>` : ''}
    </g>`;
    }

    if (node.type === 'tool') {
      const details = node.details as Tool;
      const risk = details.risk || 'low';
      let stroke = '#14b8a6';
      let fill = '#0d2e27';
      let riskLabel = risk.toUpperCase();

      if (risk === 'high' || risk === 'critical') {
        stroke = '#ef4444';
        fill = '#3b0712';
      } else if (risk === 'medium') {
        stroke = '#f59e0b';
        fill = '#351608';
      }

      svgContent += `
    <!-- Tool: ${node.id} -->
    <g transform="translate(${node.x - 65}, ${node.y - 25})">
      <rect width="130" height="50" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
      <text x="65" y="22" fill="#ccfbf1" font-size="11" font-weight="700" text-anchor="middle">${node.label}</text>
      <text x="65" y="35" fill="#2dd4bf" font-size="8" text-anchor="middle">${details.type || 'api'}</text>
      <rect x="65" y="-6" width="45" height="12" rx="4" transform="translate(-22.5, 43)" fill="${stroke}" />
      <text x="65" y="48" fill="#ffffff" font-size="7" font-weight="800" text-anchor="middle">${riskLabel}</text>
    </g>`;
    }

    if (node.type === 'mcp') {
      const details = node.details as McpServer;
      const level = details.trust_level || 'internal';
      let stroke = '#10b981';
      let fill = '#064e3b';
      if (level === 'external' || level === 'untrusted') {
        stroke = '#f97316';
        fill = '#431407';
      }

      svgContent += `
    <!-- MCP Server: ${node.id} -->
    <g transform="translate(${node.x - 70}, ${node.y - 25})">
      <rect width="140" height="50" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
      <text x="70" y="22" fill="#d1fae5" font-size="11" font-weight="700" text-anchor="middle">${node.label}</text>
      <text x="70" y="34" fill="#a7f3d0" font-size="8" text-anchor="middle">MCP Server</text>
      <text x="70" y="44" fill="#f43f5e" font-size="7" font-weight="800" text-anchor="middle">${level.toUpperCase()}</text>
    </g>`;
    }

    if (node.type === 'dataclass') {
      const dc = node.details as DataClass;
      let stroke = '#10b981';
      let fill = '#064e3b';
      
      if (dc.sensitivity === 'critical') {
        stroke = '#ef4444';
        fill = '#450a0a';
      } else if (dc.sensitivity === 'high') {
        stroke = '#f97316';
        fill = '#431407';
      }

      svgContent += `
    <!-- Data Class: ${node.id} -->
    <g transform="translate(${node.x - 60}, ${node.y - 20})">
      <rect width="120" height="40" rx="20" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
      <text x="60" y="20" fill="#e6f4ea" font-size="10" font-weight="700" text-anchor="middle">${node.label}</text>
      <text x="60" y="30" fill="#34d399" font-size="7" text-anchor="middle">${(dc.classification || 'data').toUpperCase()}</text>
    </g>`;
    }
  });

  svgContent += `
  </g>

  <!-- Title & Legend -->
  <g id="header" transform="translate(40, 50)">
    <text x="0" y="0" fill="#ffffff" font-size="18" font-weight="800" letter-spacing="0.5">${data.system.toUpperCase()}</text>
    <text x="0" y="16" fill="#94a3b8" font-size="11">OpenAgentModel System Architecture Map (v${data.version})</text>
  </g>

  <!-- Legend Box -->
  <g id="legend" transform="translate(40, ${height - 110})">
    <rect width="210" height="85" rx="6" fill="#0f172a" fill-opacity="0.9" stroke="#334155" stroke-width="1" />
    <text x="10" y="18" fill="#94a3b8" font-size="9" font-weight="700">LEGEND</text>
    
    <rect x="10" y="28" width="10" height="10" rx="2" fill="#1e1b4b" stroke="#8b5cf6" stroke-width="1" />
    <text x="25" y="36" fill="#cbd5e1" font-size="8">AI Agent Node</text>

    <rect x="10" y="43" width="10" height="10" rx="2" fill="#0d2e27" stroke="#14b8a6" stroke-width="1" />
    <text x="25" y="51" fill="#cbd5e1" font-size="8">Tool Node</text>

    <rect x="110" y="28" width="10" height="10" rx="2" fill="#064e3b" stroke="#10b981" stroke-width="1" />
    <text x="125" y="36" fill="#cbd5e1" font-size="8">Data Class (Secure)</text>

    <rect x="110" y="43" width="10" height="10" rx="2" fill="#431407" stroke="#f97316" stroke-width="1" />
    <text x="125" y="51" fill="#cbd5e1" font-size="8">MCP / External Integration</text>

    <path d="M 10 68 L 40 68" stroke="#ef4444" stroke-width="2" stroke-dasharray="3 2" />
    <text x="45" y="71" fill="#ef4444" font-size="8" font-weight="700">Privilege Escalation / Threat Path</text>
  </g>
</svg>
`;

  return svgContent;
}

export function diagramCommand(options: { input: string; output: string }): number {
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);

  // Validate first
  const validation = validateYaml(inputPath);
  if (!validation.valid) {
    console.error(`\x1b[31mError validating agent model before rendering diagram:\x1b[0m`);
    validation.errors?.forEach((err) => console.error(`  - ${err}`));
    return 1;
  }

  if (!validation.data) {
    console.error(`\x1b[31mError: Loaded config data is empty.\x1b[0m`);
    return 1;
  }

  const svg = generateSvgDiagram(validation.data);

  try {
    fs.writeFileSync(outputPath, svg, 'utf8');
    console.log(`\x1b[32m✔ Successfully rendered Agent architecture diagram at ${outputPath}\x1b[0m`);
    return 0;
  } catch (error: unknown) {
    console.error(`Error saving SVG file: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
