#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { validateCommand } from './commands/validate.js';
import { diagramCommand } from './commands/diagram.js';
import { riskCommand } from './commands/risk.js';
import { reportCommand } from './commands/report.js';
import { importMcpCommand } from './commands/import-mcp.js';
import { driftCommand } from './commands/drift.js';
import { getPackageVersion } from './core/version.js';

const program = new Command();

program
  .name('oam')
  .description('OpenAgentModel CLI: Design-time and CI-time modelling and governance for AI Agent systems')
  .version(getPackageVersion());

program
  .command('init')
  .description('Initialize a new agentmodel.yaml configuration file')
  .option('-o, --output <file>', 'Output file path', 'agentmodel.yaml')
  .action((options) => {
    const code = initCommand(options);
    process.exit(code);
  });

program
  .command('validate')
  .description('Validate agentmodel.yaml against the JSON schema')
  .option('-i, --input <file>', 'Input agent model YAML file', 'agentmodel.yaml')
  .option('--as-of <date>', 'Validation date for expiry checks (YYYY-MM-DD or ISO date-time)')
  .action((options) => {
    const code = validateCommand(options);
    process.exit(code);
  });

program
  .command('diagram')
  .description('Generate an SVG architecture diagram of the agent system')
  .option('-i, --input <file>', 'Input agent model YAML file', 'agentmodel.yaml')
  .option('-o, --output <file>', 'Output SVG file path', 'agent-map.svg')
  .action((options) => {
    const code = diagramCommand(options);
    process.exit(code);
  });

program
  .command('risk')
  .description('Run static risk engine checks against the agent system')
  .option('-i, --input <file>', 'Input agent model YAML file', 'agentmodel.yaml')
  .option('--fail-on <level>', 'Risk level to trigger non-zero exit code (low, medium, high, critical)', 'high')
  .option('--sarif <file>', 'Output path for SARIF security report')
  .option('--as-of <date>', 'Validation date for expiry checks (YYYY-MM-DD or ISO date-time)')
  .action((options) => {
    const code = riskCommand(options);
    process.exit(code);
  });

program
  .command('report')
  .description('Generate validation reports, SVG diagram, ABOM, and interactive HTML dashboard')
  .option('-i, --input <file>', 'Input agent model YAML file', 'agentmodel.yaml')
  .option('-d, --dir <directory>', 'Output directory for reports', '.')
  .option('--as-of <date>', 'Validation date for expiry checks (YYYY-MM-DD or ISO date-time)')
  .action((options) => {
    const code = reportCommand(options);
    process.exit(code);
  });

program
  .command('import-mcp')
  .description('Import MCP tools from a saved tools/list JSON file')
  .option('-i, --input <file>', 'Input agent model YAML file', 'agentmodel.yaml')
  .option('--mcp-id <id>', 'Identifier for the MCP server', 'my-mcp-server')
  .option('--tools-file <file>', 'JSON file containing exposed MCP tools definitions')
  .option('--trust-level <level>', 'Trust zone boundary (internal, partner, external, untrusted)', 'external')
  .action((options) => {
    const code = importMcpCommand(options);
    process.exit(code);
  });

program
  .command('drift')
  .description('Compare runtime OpenTelemetry traces against design-time specification to detect drift')
  .option('-i, --input <file>', 'Input agent model YAML file', 'agentmodel.yaml')
  .option('-t, --traces <file>', 'Input OpenTelemetry JSON traces file', 'traces.json')
  .action(async (options) => {
    const code = await driftCommand(options);
    process.exit(code);
  });

program.parse(process.argv);
