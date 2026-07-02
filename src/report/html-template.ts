import type { Finding } from '../risk-engine/rules/index.js';
import { generateRegoPolicy } from './policy-template.js';
import { SystemModel, Agent, Tool, McpServer } from '../core/model.js';

export function generateHtmlReport(
  data: SystemModel,
  svg: string,
  findings: Finding[],
  policyMd: string,
  abomJson: unknown
): string {
  // Compute risk score (0-100)
  let scorePoints = 0;
  findings.forEach((f) => {
    if (f.severity === 'critical') scorePoints += 30;
    else if (f.severity === 'high') scorePoints += 15;
    else if (f.severity === 'medium') scorePoints += 5;
    else scorePoints += 1;
  });
  const riskScore = Math.min(100, scorePoints);
  
  let riskLevel = 'LOW';
  let riskColor = '#10b981';
  let riskGlow = 'rgba(16, 185, 129, 0.4)';
  if (riskScore >= 70) {
    riskLevel = 'CRITICAL';
    riskColor = '#ef4444';
    riskGlow = 'rgba(239, 68, 68, 0.4)';
  } else if (riskScore >= 40) {
    riskLevel = 'HIGH';
    riskColor = '#f97316';
    riskGlow = 'rgba(249, 115, 22, 0.4)';
  } else if (riskScore >= 15) {
    riskLevel = 'MEDIUM';
    riskColor = '#f59e0b';
    riskGlow = 'rgba(245, 158, 11, 0.4)';
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const medLowCount = findings.filter((f) => f.severity === 'medium' || f.severity === 'low').length;

  const agentsCount = data.agents?.length || 0;
  const toolsCount = data.tools?.length || 0;
  const mcpCount = data.mcp_servers?.length || 0;
  const mcpServers = data.mcp_servers || [];

  // Build Findings list HTML
  const findingsHtml = findings.map((f, idx) => {
    let badgeColor = '#64748b';
    if (f.severity === 'critical') badgeColor = '#ef4444';
    else if (f.severity === 'high') badgeColor = '#f97316';
    else if (f.severity === 'medium') badgeColor = '#f59e0b';
    else if (f.severity === 'low') badgeColor = '#3b82f6';

    return `
    <div class="finding-card border-${f.severity}">
      <div class="finding-header" onclick="toggleDetails('find-${idx}')">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="finding-badge" style="background-color: ${badgeColor};">${f.severity.toUpperCase()}</span>
          <span class="finding-title">${f.title}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="finding-agent">Agent: <code>${f.agentId}</code></span>
          <span class="chevron" id="chevron-find-${idx}">▼</span>
        </div>
      </div>
      <div class="finding-details" id="find-${idx}" style="display: none;">
        <div class="finding-body">
          <p><strong>Description:</strong> ${f.description}</p>
          <div class="recommendation-box">
            <span style="font-weight: 700; color: #38bdf8;">Shield Recommendation:</span>
            <p style="margin: 4px 0 0 0;">${f.recommendation}</p>
          </div>
          <div class="mapping-box" style="margin-top: 12px; font-size: 11px; color: #94a3b8;">
            <strong>OWASP Mapping:</strong> <code>${f.owaspMapping}</code>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Build ABOM Table rows HTML
  const abomRows = (data.agents || []).map((agent: Agent) => {
    const allowedToolsList = agent.allowed_tools?.join(', ') || 'None';
    const delegatesList = agent.allowed_delegates?.join(', ') || 'None';
    const memoryContains = agent.memory?.contains?.join(', ') || 'None';
    const memoryProtection = agent.memory?.poisoning_protection ? '✔ Enabled' : '✘ Disabled';
    
    return `
    <tr>
      <td><strong style="color: #c084fc;">${agent.id}</strong></td>
      <td><span class="autonomy-pill">${agent.autonomy || 'supervised'}</span></td>
      <td><code>${agent.framework || 'native'}</code></td>
      <td><span style="font-size: 11px;">${allowedToolsList}</span></td>
      <td><span style="font-size: 11px;">${delegatesList}</span></td>
      <td>
        <div style="font-size: 10px; line-height: 1.3;">
          <div>Type: <code>${agent.memory?.type || 'none'}</code></div>
          <div>Contains: <code>${memoryContains}</code></div>
          <div>Poisoning Check: <code style="color:${agent.memory?.poisoning_protection ? '#4ade80':'#f87171'};">${memoryProtection}</code></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const toolsRows = (data.tools || []).map((t: Tool) => {
    let riskColorBadge = '#10b981';
    if (t.risk === 'high' || t.risk === 'critical') riskColorBadge = '#ef4444';
    else if (t.risk === 'medium') riskColorBadge = '#f59e0b';
    
    return `
    <tr>
      <td><strong>${t.id}</strong></td>
      <td><code>${t.type}</code></td>
      <td><span style="font-size: 11px;">${t.description || ''}</span></td>
      <td><code>${t.data_classes?.join(', ') || 'None'}</code></td>
      <td><span class="finding-badge" style="background-color: ${riskColorBadge};">${t.risk || 'low'}</span></td>
      <td><code>${t.requires_human_approval ? '✔ Yes' : '✘ No'}</code></td>
    </tr>`;
  }).join('');

  const mcpRows = (data.mcp_servers || []).map((m: McpServer) => {
    let trustColor = '#10b981';
    if (m.trust_level === 'external' || m.trust_level === 'untrusted') trustColor = '#f97316';
    
    return `
    <tr>
      <td><strong>${m.id}</strong></td>
      <td><span class="finding-badge" style="background-color: ${trustColor};">${m.trust_level}</span></td>
      <td><code>${m.exposes?.join(', ') || 'None'}</code></td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenAgentModel Security & Governance Readiness Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #070a13;
      --panel-dark: #0f1527;
      --border-dark: #1e293b;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #8b5cf6;
      --accent-glow: rgba(139, 92, 246, 0.4);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      overflow-x: hidden;
      line-height: 1.5;
    }
    
    /* Elegant Dark Space Background */
    .space-bg {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: radial-gradient(circle at 20% 20%, rgba(30, 27, 75, 0.4) 0%, transparent 40%),
                  radial-gradient(circle at 80% 80%, rgba(13, 58, 47, 0.3) 0%, transparent 40%);
      z-index: -1;
      pointer-events: none;
    }

    header {
      padding: 24px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-dark);
      background-color: rgba(15, 21, 39, 0.7);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-container h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 22px;
      font-weight: 800;
      background: linear-gradient(135deg, #a78bfa 0%, #38bdf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: 0.5px;
    }

    .system-badge {
      background-color: #3b82f6;
      color: #ffffff;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .main-container {
      padding: 40px;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Tab navigation layout */
    .tabs-nav {
      display: flex;
      gap: 12px;
      margin-bottom: 30px;
      border-bottom: 1px solid var(--border-dark);
      padding-bottom: 12px;
    }

    .tab-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-family: 'Outfit', sans-serif;
      font-size: 15px;
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tab-btn:hover {
      color: var(--text-main);
      background-color: rgba(255, 255, 255, 0.05);
    }

    .tab-btn.active {
      color: var(--text-main);
      background-color: var(--accent);
      box-shadow: 0 0 15px var(--accent-glow);
    }

    /* Metric Layout grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .metric-card {
      background-color: rgba(15, 21, 39, 0.6);
      border: 1px solid var(--border-dark);
      border-radius: 12px;
      padding: 20px;
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s ease;
    }

    .metric-card:hover {
      transform: translateY(-2px);
    }

    .metric-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .metric-value {
      font-family: 'Outfit', sans-serif;
      font-size: 32px;
      font-weight: 800;
      line-height: 1.1;
    }

    /* Glowing Ring for Risk score */
    .risk-score-container {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .risk-score-ring {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 20px;
      border: 5px solid #1e293b;
      box-shadow: 0 0 15px var(--accent-glow);
    }

    /* Content tabs styling */
    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
      animation: fadeIn 0.4s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .layout-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }

    @media (max-width: 1024px) {
      .layout-split {
        grid-template-columns: 1fr;
      }
    }

    .panel {
      background-color: rgba(15, 21, 39, 0.6);
      border: 1px solid var(--border-dark);
      border-radius: 16px;
      padding: 30px;
      backdrop-filter: blur(8px);
      margin-bottom: 30px;
    }

    .panel h2 {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--border-dark);
      padding-bottom: 10px;
    }

    /* Findings / Risk accordion style */
    .findings-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .finding-card {
      background-color: rgba(2, 6, 12, 0.5);
      border: 1px solid var(--border-dark);
      border-radius: 10px;
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .finding-card:hover {
      background-color: rgba(2, 6, 12, 0.7);
    }

    .border-critical { border-left: 4px solid #ef4444; }
    .border-high { border-left: 4px solid #f97316; }
    .border-medium { border-left: 4px solid #f59e0b; }
    .border-low { border-left: 4px solid #3b82f6; }

    .finding-header {
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }

    .finding-badge {
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      color: #ffffff;
    }

    .finding-title {
      font-weight: 600;
      font-size: 14px;
    }

    .finding-agent {
      font-size: 12px;
      color: var(--text-muted);
    }

    .finding-agent code {
      background-color: rgba(255,255,255,0.06);
      padding: 2px 6px;
      border-radius: 4px;
      color: #c084fc;
    }

    .chevron {
      color: var(--text-muted);
      font-size: 10px;
      transition: transform 0.2s ease;
    }

    .finding-details {
      border-top: 1px solid var(--border-dark);
      background-color: rgba(0, 0, 0, 0.2);
    }

    .finding-body {
      padding: 20px;
      font-size: 13.5px;
      color: #cbd5e1;
    }

    .recommendation-box {
      margin-top: 16px;
      background-color: rgba(14, 165, 233, 0.08);
      border: 1px solid rgba(14, 165, 233, 0.2);
      border-radius: 8px;
      padding: 12px 16px;
    }

    /* Diagram Tab styling */
    .svg-wrapper {
      width: 100%;
      background-color: rgba(2, 6, 12, 0.6);
      border-radius: 12px;
      border: 1px solid var(--border-dark);
      padding: 10px;
      display: flex;
      justify-content: center;
      overflow: hidden;
    }

    .svg-wrapper svg {
      max-height: 580px;
      width: 100%;
      height: auto;
    }

    /* Tables */
    .table-container {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    th {
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 2px solid var(--border-dark);
      padding: 12px;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid var(--border-dark);
      color: #cbd5e1;
    }

    tr:hover td {
      background-color: rgba(255,255,255,0.02);
    }

    .autonomy-pill {
      background-color: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #93c5fd;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    /* Code Blocks */
    pre {
      background-color: rgba(2, 6, 12, 0.8);
      border: 1px solid var(--border-dark);
      border-radius: 8px;
      padding: 20px;
      overflow-x: auto;
      color: #e2e8f0;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.5;
    }

    code {
      font-family: 'Courier New', Courier, monospace;
    }

    .btn-copy {
      background-color: var(--accent);
      border: none;
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-block;
      margin-top: 10px;
      transition: background-color 0.2s ease;
    }

    .btn-copy:hover {
      background-color: #7c3aed;
    }

  </style>
</head>
<body>
  <div class="space-bg"></div>
  
  <header>
    <div class="logo-container">
      <h1>OpenAgentModel</h1>
      <span class="system-badge">${data.system} v${data.version}</span>
    </div>
    <div style="font-size: 12px; color: var(--text-muted);">
      Readiness Report: <strong>${new Date().toLocaleDateString()}</strong>
    </div>
  </header>

  <main class="main-container">
    
    <!-- Top Level Stat Cards -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div>
          <div class="metric-label">System Security Profile</div>
          <div class="risk-score-container" style="margin-top: 10px;">
            <div class="risk-score-ring" style="border-color: ${riskColor}; color: ${riskColor}; box-shadow: 0 0 15px ${riskGlow};">
              ${riskScore}
            </div>
            <div>
              <div style="font-weight: 800; font-size: 16px; color: ${riskColor};">${riskLevel}</div>
              <div style="font-size: 11px; color: var(--text-muted);">Risk Score (0-100)</div>
            </div>
          </div>
        </div>
      </div>

      <div class="metric-card">
        <div>
          <div class="metric-label">Critical Risks</div>
          <div class="metric-value" style="color: #ef4444; text-shadow: 0 0 10px rgba(239, 68, 68, 0.3);">${criticalCount}</div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Privilege Escalations / A2A Exploits</div>
      </div>

      <div class="metric-card">
        <div>
          <div class="metric-label">High Risks</div>
          <div class="metric-value" style="color: #f97316; text-shadow: 0 0 10px rgba(249, 115, 22, 0.3);">${highCount}</div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Direct Tool Misuse / Exfiltration</div>
      </div>

      <div class="metric-card">
        <div>
          <div class="metric-label">Medium & Low Risks</div>
          <div class="metric-value" style="color: #f59e0b;">${medLowCount}</div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Retry Limits / Missing Loops detection</div>
      </div>

      <div class="metric-card">
        <div>
          <div class="metric-label">Entities Modelled</div>
          <div class="metric-value" style="color: #a78bfa;">${agentsCount} <span style="font-size: 14px; font-weight: 500; color: var(--text-muted);">Agents</span></div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">${toolsCount} Tools, ${mcpCount} MCP Boundary Servers</div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('tab-dashboard')">📊 Dashboard</button>
      <button class="tab-btn" onclick="switchTab('tab-map')">🗺 Visual Architecture Map</button>
      <button class="tab-btn" onclick="switchTab('tab-abom')">📋 Agent BOM (ABOM)</button>
      <button class="tab-btn" onclick="switchTab('tab-policies')">🛡 Generated Guardrails</button>
    </div>

    <!-- Dashboard Content Tab -->
    <div id="tab-dashboard" class="tab-content active">
      <div class="layout-split">
        <!-- Findings Panel -->
        <div class="panel">
          <h2>⚠ Security Findings (${findings.length})</h2>
          ${findings.length === 0 ? `
            <div style="padding: 40px; text-align: center; color: #10b981;">
              <span style="font-size: 32px;">✔</span>
              <p style="margin-top: 10px; font-weight: 600;">No static risks detected in your architecture model.</p>
            </div>
          ` : `
            <div class="findings-container">
              ${findingsHtml}
            </div>
          `}
        </div>

        <!-- Right: Overview Panel -->
        <div>
          <div class="panel">
            <h2>🔎 Modeling Checklist Summary</h2>
            <div class="table-container">
              <table style="width: 100%;">
                <thead>
                  <tr>
                    <th>Security Dimension</th>
                    <th>Status</th>
                    <th>Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Human-in-the-Loop Gate</strong></td>
                    <td>${data.agents?.some((a: Agent) => a.autonomy === 'human-approval-required') ? '<span style="color: #10b981;">✔ Standardised</span>' : '<span style="color: #ef4444;">✘ Fully Autonomous</span>'}</td>
                    <td>Ensures refund/dangerous paths verify transactions manually.</td>
                  </tr>
                  <tr>
                    <td><strong>Memory Poisoning Protection</strong></td>
                    <td>${data.agents?.every((a: Agent) => !a.memory || a.memory.poisoning_protection) ? '<span style="color: #10b981;">✔ Fully Protected</span>' : '<span style="color: #f59e0b;">⚠ Partial Protection</span>'}</td>
                    <td>Memory writes are monitored for instruction injections.</td>
                  </tr>
                  <tr>
                    <td><strong>Escalation Limits</strong></td>
                    <td>${criticalCount === 0 ? '<span style="color: #10b981;">✔ Secure</span>' : '<span style="color: #ef4444;">✘ Escalations Detected</span>'}</td>
                    <td>Limits A2A chains that bypass tool authorization boundaries.</td>
                  </tr>
                  <tr>
                    <td><strong>External MCP Servers</strong></td>
                    <td>${mcpServers.some((m: McpServer) => m.trust_level === 'external') ? '<span style="color: #f97316;">⚠ External MCPS</span>' : '<span style="color: #10b981;">✔ Internal-Only</span>'}</td>
                    <td>Validates boundary permissions for untrusted nodes.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <h2>💡 Quick Security Recommendation</h2>
            <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.6;">
              Your modeling setup defines a multi-agent delegation schema. Ensure that your CI pipeline runs <code>oam risk --fail-on high</code> during every build. 
              This blocks any Pull Requests that attempt to grant direct write tools to supervised agents without corresponding approval gates.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Visual Architecture Map Tab -->
    <div id="tab-map" class="tab-content">
      <div class="panel">
        <h2>🗺 Agent Architecture & Threat Map</h2>
        <div class="svg-wrapper">
          ${svg}
        </div>
      </div>
    </div>

    <!-- ABOM Tab -->
    <div id="tab-abom" class="tab-content">
      <div class="panel">
        <h2>📋 Agent Bill of Materials</h2>
        <div class="table-container" style="margin-bottom: 30px;">
          <h3 style="font-size: 15px; margin-bottom: 12px; color: #a78bfa;">AI Agents</h3>
          <table>
            <thead>
              <tr>
                <th>Agent ID</th>
                <th>Autonomy</th>
                <th>Framework</th>
                <th>Allowed Tools</th>
                <th>Delegates</th>
                <th>Memory Settings</th>
              </tr>
            </thead>
            <tbody>
              ${abomRows}
            </tbody>
          </table>
        </div>

        <div class="table-container" style="margin-bottom: 30px;">
          <h3 style="font-size: 15px; margin-bottom: 12px; color: #14b8a6;">Tools Capability</h3>
          <table>
            <thead>
              <tr>
                <th>Tool ID</th>
                <th>Type</th>
                <th>Description</th>
                <th>Data Touched</th>
                <th>Risk Category</th>
                <th>Human Approval</th>
              </tr>
            </thead>
            <tbody>
              ${toolsRows}
            </tbody>
          </table>
        </div>

        <div class="table-container">
          <h3 style="font-size: 15px; margin-bottom: 12px; color: #34d399;">Model Context Protocol (MCP) Server Integrations</h3>
          <table>
            <thead>
              <tr>
                <th>Server ID</th>
                <th>Trust Boundary</th>
                <th>Exposed Tools</th>
              </tr>
            </thead>
            <tbody>
              ${mcpRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Generated Guardrails Tab -->
    <div id="tab-policies" class="tab-content">
      <div class="panel">
        <h2>🛡 Generated Policies & Guardrail Code</h2>
        <p style="font-size: 13.5px; color: #cbd5e1; margin-bottom: 20px;">
          Adapt these Rego-style examples for your runtime gateway or policy engine to enforce these boundaries during execution.
        </p>
        
        <pre><code id="policy-code">${generateRegoPolicy()}</code></pre>
        
        <button class="btn-copy" onclick="copyPolicy()">Copy Policy Code</button>
      </div>
    </div>

  </main>

  <script>
    function switchTab(tabId) {
      // Hide all contents
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      // Deactivate all buttons
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      
      // Show target
      document.getElementById(tabId).classList.add('active');
      
      // Activate clicked button
      // Map clicked button based on target ID
      const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => {
        return b.getAttribute('onclick').includes(tabId);
      });
      if (btn) btn.classList.add('active');
    }

    function toggleDetails(cardId) {
      const details = document.getElementById(cardId);
      const chevron = document.getElementById('chevron-' + cardId);
      
      if (details.style.display === 'none') {
        details.style.display = 'block';
        chevron.style.transform = 'rotate(180deg)';
      } else {
        details.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
      }
    }

    function copyPolicy() {
      const codeText = document.getElementById('policy-code').textContent;
      navigator.clipboard.writeText(codeText).then(() => {
        alert('Rego-style policy example copied to clipboard!');
      });
    }
  </script>
</body>
</html>
`;
}
