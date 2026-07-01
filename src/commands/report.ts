import fs from 'fs';
import path from 'path';
import { validateYaml } from './validate.js';
import { runRiskChecks } from '../risk-engine/rules.js';
import { generateSvgDiagram } from './diagram.js';
import { generatePolicyRecommendationsMd } from '../report/policy-template.js';
import { generateHtmlReport } from '../report/html-template.js';
import { SystemModel, Agent, Tool, McpServer } from '../core/model.js';
import { generateSarifReport } from '../report/sarif-builder.js';
import { generateOtelSchema } from '../report/otel-exporter.js';

export function reportCommand(options: { input: string; dir: string }) {
  const inputPath = path.resolve(options.input);
  const outputDir = path.resolve(options.dir);

  // Validate first
  const validation = validateYaml(inputPath);
  if (!validation.valid) {
    console.error(`\x1b[31mError validating agent model before generating report:\x1b[0m`);
    validation.errors?.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  if (!validation.data) {
    console.error(`\x1b[31mError: Loaded config data is empty.\x1b[0m`);
    process.exit(1);
  }

  const data = validation.data;

  // Run risk engine
  const findings = runRiskChecks(data);

  // Generate SVG diagram content
  const svg = generateSvgDiagram(data);

  // Generate policies markdown content
  const policyMd = generatePolicyRecommendationsMd(data);

  // Generate ABOM structure
  const abom = {
    system: data.system,
    version: data.version,
    generatedAt: new Date().toISOString(),
    riskSummary: {
      totalFindings: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    },
    agents: (data.agents || []).map((a: Agent) => ({
      id: a.id,
      purpose: a.purpose,
      framework: a.framework,
      autonomy: a.autonomy,
      memory: a.memory,
      allowedTools: a.allowed_tools,
      delegates: a.allowed_delegates,
    })),
    tools: (data.tools || []).map((t: Tool) => ({
      id: t.id,
      type: t.type,
      risk: t.risk,
      requiresHumanApproval: t.requires_human_approval,
      dataClasses: t.data_classes,
    })),
    mcpServers: (data.mcp_servers || []).map((m: McpServer) => ({
      id: m.id,
      trustLevel: m.trust_level,
      exposes: m.exposes,
    }))
  };

  // Generate html dashboard content
  const html = generateHtmlReport(data, svg, findings, policyMd, abom);

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const svgPath = path.join(outputDir, 'agent-map.svg');
  const bomPath = path.join(outputDir, 'agent-bom.json');
  const policyPath = path.join(outputDir, 'policy-recommendations.md');
  const htmlPath = path.join(outputDir, 'agent-risk-report.html');
  const sarifPath = path.join(outputDir, 'agent-risks.sarif');
  const otelPath = path.join(outputDir, 'otel-schema.json');

  const sarif = generateSarifReport(findings, options.input);
  const otel = generateOtelSchema(data);

  try {
    fs.writeFileSync(svgPath, svg, 'utf8');
    fs.writeFileSync(bomPath, JSON.stringify(abom, null, 2), 'utf8');
    fs.writeFileSync(policyPath, policyMd, 'utf8');
    fs.writeFileSync(htmlPath, html, 'utf8');
    fs.writeFileSync(sarifPath, sarif, 'utf8');
    fs.writeFileSync(otelPath, otel, 'utf8');

    console.log(`\n\x1b[32m✔ Successfully generated OpenAgentModel Governance Pack:\x1b[0m`);
    console.log(`  - Visual Map:          \x1b[34m${svgPath}\x1b[0m`);
    console.log(`  - Bill of Materials:   \x1b[34m${bomPath}\x1b[0m`);
    console.log(`  - Policies (Rego/AGT): \x1b[34m${policyPath}\x1b[0m`);
    console.log(`  - SARIF Code Quality:  \x1b[34m${sarifPath}\x1b[0m`);
    console.log(`  - OTel Telemetry:      \x1b[34m${otelPath}\x1b[0m`);
    console.log(`  - Interactive Report:  \x1b[34m${htmlPath}\x1b[0m\n`);
  } catch (error: any) {
    console.error(`Error saving report packages: ${error?.message || error}`);
    process.exit(1);
  }
}
