import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../../');

function writeTempSnapshot(name: string, content: any): string {
  const tmpPath = path.resolve(ROOT, `test-diff-temp-${name}.json`);
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

test('MCP Diff Command Test Suite', async (t) => {
  await t.test('1. Diff reports no changes for identical snapshots', () => {
    const before = writeTempSnapshot('before1', [
      { name: 'tool-a', description: 'desc a' }
    ]);
    const after = writeTempSnapshot('after1', [
      { name: 'tool-a', description: 'desc a' }
    ]);

    try {
      const output = cleanAnsi(execSync(
        `node dist/index.js mcp-diff --before ${before} --after ${after}`,
        { encoding: 'utf8', cwd: ROOT }
      ));
      assert.match(output, /No changes detected between MCP tool snapshots/, 'should report no changes');
    } finally {
      cleanup(before, after);
    }
  });

  await t.test('2. Diff reports added and removed tools', () => {
    const before = writeTempSnapshot('before2', [
      { name: 'tool-a', description: 'desc a' },
      { name: 'tool-b', description: 'desc b' }
    ]);
    const after = writeTempSnapshot('after2', [
      { name: 'tool-b', description: 'desc b' },
      { name: 'tool-c', description: 'desc c' }
    ]);

    try {
      const output = cleanAnsi(execSync(
        `node dist/index.js mcp-diff --before ${before} --after ${after}`,
        { encoding: 'utf8', cwd: ROOT }
      ));
      assert.match(output, /Added tools:\s+1/, 'should report 1 added tool');
      assert.match(output, /Removed tools:\s+1/, 'should report 1 removed tool');
      assert.match(output, /Added Tools:\s+- tool-c/, 'should list tool-c as added');
      assert.match(output, /Removed Tools:\s+- tool-a/, 'should list tool-a as removed');
    } finally {
      cleanup(before, after);
    }
  });

  await t.test('3. Diff reports modified description, annotations, and schemas', () => {
    const before = writeTempSnapshot('before3', [
      {
        name: 'tool-a',
        description: 'old desc',
        inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
        annotations: { readOnlyHint: true }
      }
    ]);
    const after = writeTempSnapshot('after3', [
      {
        name: 'tool-a',
        description: 'new desc',
        inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
        annotations: { readOnlyHint: false, destructiveHint: true }
      }
    ]);

    try {
      const output = cleanAnsi(execSync(
        `node dist/index.js mcp-diff --before ${before} --after ${after}`,
        { encoding: 'utf8', cwd: ROOT }
      ));
      assert.match(output, /Modified tools:\s+1/, 'should report 1 modified tool');
      assert.match(output, /Description modified/, 'should report description change');
      assert.match(output, /Annotations modified/, 'should report annotations change');
      assert.match(output, /inputSchema signature altered/, 'should report schema change');
    } finally {
      cleanup(before, after);
    }
  });

  await t.test('4. Diff supports snapshot-wrapped structures', () => {
    const before = writeTempSnapshot('before4', {
      mcp_id: 'test-mcp',
      tools: [{ name: 'tool-a', description: 'desc a' }]
    });
    const after = writeTempSnapshot('after4', {
      mcp_id: 'test-mcp',
      tools: [{ name: 'tool-a', description: 'desc a' }, { name: 'tool-b', description: 'desc b' }]
    });

    try {
      const output = cleanAnsi(execSync(
        `node dist/index.js mcp-diff --before ${before} --after ${after}`,
        { encoding: 'utf8', cwd: ROOT }
      ));
      assert.match(output, /Added tools:\s+1/, 'should successfully parse snapshot structures');
    } finally {
      cleanup(before, after);
    }
  });

  await t.test('5. Diff output strips hostile terminal control sequences from MCP metadata', () => {
    const before = writeTempSnapshot('before5', [
      { name: 'tool-a', description: 'old description' }
    ]);
    const after = writeTempSnapshot('after5', [
      { name: 'tool-a\u001b[31m', description: 'new\u001b[2Jdescription\u0007' }
    ]);

    try {
      const output = execSync(
        `node dist/index.js mcp-diff --before ${before} --after ${after}`,
        { encoding: 'utf8', cwd: ROOT }
      );
      assert.doesNotMatch(output, /\u001b\[2J/, 'untrusted descriptions must not emit clear-screen escapes');
      assert.doesNotMatch(output, /\u0007/, 'untrusted descriptions must not emit terminal bells');
      assert.match(cleanAnsi(output), /newdescription/, 'safe text content should remain visible');
    } finally {
      cleanup(before, after);
    }
  });
});
