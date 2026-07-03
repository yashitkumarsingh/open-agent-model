import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../../');

function writeTempBom(name: string, content: any): string {
  const tmpPath = path.resolve(ROOT, `test-bom-temp-${name}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(content, null, 2), 'utf8');
  return tmpPath;
}

function cleanup(...paths: string[]) {
  paths.forEach((p) => {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  });
}

function cleanAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

test('Agent-BOM Diff Command Test Suite', async (t) => {
  await t.test('1. Reports no changes for identical Agent-BOMs', () => {
    const bom = {
      system: 'test-system',
      version: '1.0.0',
      agents: [{ id: 'agent-1' }],
      tools: [{ id: 'tool-1', type: 'api', risk: 'low' }],
      findings: []
    };
    const base = writeTempBom('base1', bom);
    const head = writeTempBom('head1', bom);

    try {
      const output = cleanAnsi(execSync(
        `node dist/index.js diff --base ${base} --head ${head}`,
        { encoding: 'utf8', cwd: ROOT }
      ));
      assert.match(output, /No changes detected between Agent-BOM baseline and head/, 'should report no changes');
    } finally {
      cleanup(base, head);
    }
  });

  await t.test('2. Reports added, removed, and modified tools and agents', () => {
    const baseBom = {
      agents: [
        { id: 'agent-a', model: 'gpt-4', allowed_tools: ['tool-1'] }
      ],
      tools: [
        { id: 'tool-1', type: 'api', risk: 'low', required_scopes: ['read'] }
      ],
      findings: [
        { id: 'f-1', ruleId: 'R-001', severity: 'high', message: 'privilege escalation' }
      ]
    };

    const headBom = {
      agents: [
        { id: 'agent-a', model: 'gpt-4o', allowed_tools: ['tool-1', 'tool-2'] },
        { id: 'agent-b', autonomy: 'high' }
      ],
      tools: [
        { id: 'tool-1', type: 'api', risk: 'high', required_scopes: ['read', 'write'] },
        { id: 'tool-2', type: 'api', risk: 'medium' }
      ],
      findings: [
        { id: 'f-2', ruleId: 'R-015', severity: 'medium', message: 'dangerous parameter input shape' }
      ]
    };

    const base = writeTempBom('base2', baseBom);
    const head = writeTempBom('head2', headBom);

    try {
      const output = cleanAnsi(execSync(
        `node dist/index.js diff --base ${base} --head ${head}`,
        { encoding: 'utf8', cwd: ROOT }
      ));

      // Tools changes checks
      assert.match(output, /\[\+\] Tool Added:\s+tool-2/, 'should report tool-2 added');
      assert.match(output, /\[\*\] Tool Modified:\s+tool-1/, 'should report tool-1 modified');
      assert.match(output, /Risk rating:\s+low ➔ high/, 'should report risk change');
      assert.match(output, /Scopes granted:\s+write/, 'should report scopes change');

      // Agents changes checks
      assert.match(output, /\[\+\] Agent Added:\s+agent-b/, 'should report agent-b added');
      assert.match(output, /\[\*\] Agent Modified:\s+agent-a/, 'should report agent-a modified');
      assert.match(output, /Model binding:\s+gpt-4 ➔ gpt-4o/, 'should report model change');
      assert.match(output, /Tool access granted:\s+tool-2/, 'should report tool access change');

      // Findings changes checks
      assert.match(output, /\[\+\] New Finding \[R-015\]/, 'should report new finding R-015');
      assert.match(output, /\[-\] Resolved Finding \[R-001\]/, 'should report resolved finding R-001');
    } finally {
      cleanup(base, head);
    }
  });
});
