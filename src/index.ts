#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { validateCommand } from './commands/validate.js';
import { diagramCommand } from './commands/diagram.js';
import { riskCommand } from './commands/risk.js';
import { reportCommand } from './commands/report.js';
import { importMcpCommand } from './commands/import-mcp.js';
import { discoverMcpCommand } from './commands/discover-mcp.js';
import { mcpDiffCommand } from './commands/mcp-diff.js';
import { bomDiffCommand } from './commands/diff.js';
import { observeCommand } from './commands/observe.js';
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
  .option('--normalize-ids', 'Normalize tool names into safe OAM IDs', false)
  .action((options) => {
    const code = importMcpCommand(options);
    process.exit(code);
  });

program
  .command('discover-mcp')
  .description('Discover tools from an MCP server and output a snapshot or merge into the model')
  .option('--mcp-id <id>', 'Identifier for the MCP server')
  .option('--tools-file <file>', 'Bypass live query and load tools from JSON file')
  .option('--server <command>', 'Live stdio command to start the MCP server')
  .option('--arg <arg...>', 'Arguments to pass to the MCP server')
  .option('--args <args>', 'Legacy quoted argument string to pass to the MCP server')
  .option('--out <file>', 'OAM YAML file to merge the discovered tools directly into')
  .option('--snapshot <file>', 'Output path to save the MCP tools snapshot JSON file')
  .option('--trust-level <level>', 'Trust zone boundary for the MCP server', 'external')
  .option('--normalize-ids', 'Normalize tool names into safe OAM IDs', false)
  .action(async (options) => {
    const code = await discoverMcpCommand(options);
    process.exit(code);
  });

program
  .command('mcp-diff')
  .description('Compare two MCP snapshots and report the delta')
  .requiredOption('--before <file>', 'Before snapshot JSON file')
  .requiredOption('--after <file>', 'After snapshot JSON file')
  .option('--fail-on <types>', 'Fail comparison and exit with non-zero code on specified changes (added, removed, schema-change, destructive-change)')
  .action((options) => {
    const code = mcpDiffCommand(options);
    process.exit(code);
  });

program
  .command('diff')
  .description('Compare two Agent-BOM JSON files and report the difference')
  .requiredOption('--base <file>', 'Baseline Agent-BOM JSON file')
  .requiredOption('--head <file>', 'Target Agent-BOM JSON file')
  .action((options) => {
    const code = bomDiffCommand(options);
    process.exit(code);
  });

program
  .command('observe')
  .description('Ingest and normalize raw trace files into standard Runtime Evidence JSON snapshots')
  .requiredOption('-t, --traces <file>', 'Input OpenTelemetry JSON/JSONL traces file')
  .requiredOption('-o, --out <file>', 'Output path to save the normalized evidence JSON file')
  .option('--system <name>', 'Name of the agentic system being observed', 'ObservedAgenticSystem')
  .action(async (options) => {
    const code = await observeCommand(options);
    process.exit(code);
  });

program
  .command('drift')
  .description('Compare runtime OpenTelemetry traces or evidence against design-time specification to detect drift')
  .option('-i, --input <file>', 'Input agent model YAML file', 'agentmodel.yaml')
  .option('-e, --evidence <file>', 'Input Runtime Evidence JSON file')
  .option('-t, --traces <file>', 'Input OpenTelemetry JSON/JSONL traces file (legacy/direct fallback)')
  .option('--fail-on <level>', 'Gating threat level threshold (medium, high, critical)', 'high')
  .action(async (options) => {
    const code = await driftCommand(options);
    process.exit(code);
  });

program.parse(process.argv);
