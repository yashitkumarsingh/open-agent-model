import fs from 'fs';
import path from 'path';
import { validateYaml } from './validate.js';
import { runRiskChecks, Finding } from '../risk-engine/rules.js';
import { generateSarifReport } from '../report/sarif-builder.js';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_COLORS = {
  critical: '\x1b[31;1m[CRITICAL]\x1b[0m',
  high: '\x1b[31m[HIGH]\x1b[0m',
  medium: '\x1b[33m[MEDIUM]\x1b[0m',
  low: '\x1b[34m[LOW]\x1b[0m'
};

export function riskCommand(options: { input: string; failOn: string; sarif?: string }) {
  const inputPath = path.resolve(options.input);
  
  // Validate first
  const validation = validateYaml(inputPath);
  if (!validation.valid) {
    console.error(`\x1b[31mError validating agent model before risk check:\x1b[0m`);
    validation.errors?.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  if (!validation.data) {
    console.error(`\x1b[31mError: Loaded config data is empty.\x1b[0m`);
    process.exit(1);
  }

  const findings = runRiskChecks(validation.data);

  if (options.sarif) {
    const sarifPath = path.resolve(options.sarif);
    const sarifContent = generateSarifReport(findings, options.input);
    try {
      fs.writeFileSync(sarifPath, sarifContent, 'utf8');
      console.log(`\x1b[32m✔ Exported SARIF security report to ${sarifPath}\x1b[0m`);
    } catch (error: any) {
      console.error(`Error saving SARIF report: ${error?.message || error}`);
    }
  }

  // Sort findings by severity
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  console.log(`\n\x1b[1mOpenAgentModel Risk Assessment for: ${validation.data.system} (v${validation.data.version})\x1b[0m`);
  console.log(`Found ${findings.length} risk finding(s).\n`);

  findings.forEach((finding) => {
    console.log(`${SEVERITY_COLORS[finding.severity]} \x1b[1m${finding.title}\x1b[0m`);
    console.log(`  \x1b[90mID: ${finding.id} | Agent: ${finding.agentId} | Mapping: ${finding.owaspMapping}\x1b[0m`);
    console.log(`  Description: ${finding.description}`);
    console.log(`  Recommendation: ${finding.recommendation}\n`);
  });

  // Determine fail threshold
  const failOnLevel = (options.failOn || 'high').toLowerCase();
  const failThreshold = SEVERITY_ORDER[failOnLevel as keyof typeof SEVERITY_ORDER];
  
  if (failThreshold === undefined) {
    console.error(`Invalid --fail-on level: ${options.failOn}. Must be one of: low, medium, high, critical.`);
    process.exit(1);
  }

  const triggeringFindings = findings.filter(
    (f) => SEVERITY_ORDER[f.severity] <= failThreshold
  );

  if (triggeringFindings.length > 0) {
    console.error(`\x1b[31m✘ Risk gate FAILED: Found ${triggeringFindings.length} finding(s) with severity '${options.failOn}' or higher.\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m✔ Risk gate PASSED: No findings found at level '${options.failOn}' or higher.\x1b[0m`);
    process.exit(0);
  }
}
