import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Import CLI commands programmatically
import { initCommand } from '../../src/commands/init.js';
import { validateCommand } from '../../src/commands/validate.js';
import { riskCommand } from '../../src/commands/risk.js';
import { reportCommand } from '../../src/commands/report.js';
import { driftCommand } from '../../src/commands/drift.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MockResult {
  exitCode: number;
  logs: string[];
  errors: string[];
}

async function executeCommand(fn: () => number | Promise<number>): Promise<MockResult> {
  const originalLog = console.log;
  const originalError = console.error;

  const logs: string[] = [];
  const errors: string[] = [];

  console.log = (...args: unknown[]) => {
    logs.push(args.join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.join(' '));
  };

  let exitCode = 0;
  try {
    exitCode = await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { exitCode, logs, errors };
}

test('CLI End-to-End Governance Lifecycle Integration', async (t) => {
  const tempE2eDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oam-e2e-'));
  const tempModelPath = path.join(tempE2eDir, 'agentmodel.yaml');
  const tempSarifPath = path.join(tempE2eDir, 'manual-risks.sarif');
  const tempTracesPath = path.join(tempE2eDir, 'conforming-traces.json');

  try {
    // Phase 1: Initialize template config via `oam init`
    await t.test('1. oam init -> generates model spec', async () => {
      const initRes = await executeCommand(() => initCommand({ output: tempModelPath }));
      assert.ok(fs.existsSync(tempModelPath), 'Template agentmodel.yaml file must be generated');
      assert.strictEqual(initRes.exitCode, 0, 'Successful init should return exit code 0');
      assert.match(initRes.logs.join('\n'), /Successfully initialized/, 'Log should notify success');
    });

    // Phase 2: Validate the generated template config via `oam validate`
    await t.test('2. oam validate -> validates system structure', async () => {
      const validateRes = await executeCommand(() => validateCommand({ input: tempModelPath }));
      assert.strictEqual(validateRes.exitCode, 0, 'Initial model validation should succeed (exit 0)');
      assert.match(validateRes.logs.join('\n'), /is VALID/, 'Console logs should assert valid specification');
    });

    // Phase 3: Run static safety analysis rules via `oam risk`
    await t.test('3. oam risk -> validates policy limits and outputs SARIF', async () => {
      const riskRes = await executeCommand(() => riskCommand({
        input: tempModelPath,
        failOn: 'high',
        sarif: tempSarifPath
      }));

      assert.strictEqual(riskRes.exitCode, 0, 'Default template should pass all critical/high risk checks');
      assert.ok(fs.existsSync(tempSarifPath), 'SARIF log file must be exported');
      
      const sarifData = JSON.parse(fs.readFileSync(tempSarifPath, 'utf8'));
      assert.strictEqual(sarifData.version, '2.1.0', 'Exported schema format version must match SARIF 2.1.0 standard');
      assert.ok(Array.isArray(sarifData.runs[0].results), 'SARIF results should be structured as an array');
    });

    // Phase 4: Compile dashboard, ABOM pack, diagrams, and policy logs via `oam report`
    await t.test('4. oam report -> exports complete governance artifact pack', async () => {
      const reportRes = await executeCommand(() => reportCommand({
        input: tempModelPath,
        dir: tempE2eDir
      }));

      assert.strictEqual(reportRes.exitCode, 0, 'Report command should return exit code 0');
      
      const expectedAssets = [
        'agent-map.svg',
        'agent-bom.json',
        'policy-recommendations.md',
        'agent-risk-report.html',
        'agent-risks.sarif',
        'otel-schema.json',
        'agent-policy.rego'
      ];

      expectedAssets.forEach((asset) => {
        const assetPath = path.join(tempE2eDir, asset);
        assert.ok(fs.existsSync(assetPath), `Asset file '${asset}' must exist inside target dir`);
        assert.ok(fs.statSync(assetPath).size > 0, `Generated asset file '${asset}' should not be empty`);
      });

      // Verify structure of the compiled Agent-BOM
      const bomData = JSON.parse(fs.readFileSync(path.join(tempE2eDir, 'agent-bom.json'), 'utf8'));
      assert.strictEqual(bomData.bomFormat, 'OpenAgentModel-AgentBOM');
      assert.strictEqual(bomData.system, 'customer-support-platform');
      assert.ok(Array.isArray(bomData.agents), 'Agent catalog must exist in Agent-BOM');
      assert.ok(Array.isArray(bomData.tools), 'Tools catalog must exist in Agent-BOM');
    });

    // Phase 5: Audit runtime traces against design bounds via `oam drift`
    await t.test('5. oam drift -> checks conforming OpenTelemetry logs pass drift checks', async () => {
      // Mock OTel traces conforming to customer-support-platform agents tool declarations
      const conformingTraces = [
        {
          name: 'agent.tool_call',
          traceId: 'e2e-trace-1',
          spanId: 'span-tool-call-1',
          attributes: {
            'gen_ai.agent.id': 'support-triage',
            'gen_ai.tool.id': 'read-crm-data'
          }
        }
      ];

      fs.writeFileSync(tempTracesPath, JSON.stringify(conformingTraces, null, 2), 'utf8');

      const driftRes = await executeCommand(() => driftCommand({
        input: tempModelPath,
        traces: tempTracesPath
      }));

      assert.strictEqual(driftRes.exitCode, 0, 'Conforming traces should pass static drift analysis (exit 0)');
      assert.match(driftRes.logs.join('\n'), /DRIFT GATE PASSED/, 'Success trace logs should be printed');
    });

  } finally {
    // Safe resource deletion cleanup
    fs.rmSync(tempE2eDir, { recursive: true, force: true });
  }
});
