import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../../');

function writeTempModel(name: string): string {
  const tmpPath = path.resolve(ROOT, `test-discover-temp-${name}.yaml`);
  const initialContent = `
system: "test-system"
version: "1.0.0"
agents: []
tools: []
mcp_servers: []
`;
  fs.writeFileSync(tmpPath, initialContent, 'utf8');
  return tmpPath;
}

function writeTempTools(name: string, tools: any[]): string {
  const tmpPath = path.resolve(ROOT, `test-discover-temp-${name}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(tools, null, 2), 'utf8');
  return tmpPath;
}

function cleanup(...paths: string[]) {
  paths.forEach((p) => {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  });
}

test('MCP Discovery Command Test Suite', async (t) => {
  await t.test('1. File-based discovery saves snapshot file', () => {
    const toolsPath = writeTempTools('snap-in', [{ name: 'file-tool-1', description: 'desc' }]);
    const snapshotPath = path.resolve(ROOT, 'test-discover-snap-out.json');
    try {
      const output = execSync(
        `node dist/index.js discover-mcp --mcp-id file-mcp --tools-file ${toolsPath} --snapshot ${snapshotPath}`,
        { encoding: 'utf8', cwd: ROOT }
      );
      assert.match(output, /Discovered 1 tool\(s\)/, 'should report discovered tools count');
      assert.match(output, /Saved MCP snapshot JSON to/, 'should log snapshot save path');

      assert.strictEqual(fs.existsSync(snapshotPath), true, 'snapshot file must be created');
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      assert.strictEqual(snapshot.mcp_id, 'file-mcp');
      assert.strictEqual(snapshot.tools[0].name, 'file-tool-1');
    } finally {
      cleanup(toolsPath, snapshotPath);
    }
  });

  await t.test('2. File-based discovery merges tools directly into model', () => {
    const modelPath = writeTempModel('merge');
    const toolsPath = writeTempTools('merge-in', [{ name: 'merge-tool-1' }]);
    try {
      execSync(
        `node dist/index.js discover-mcp --mcp-id merge-mcp --tools-file ${toolsPath} --out ${modelPath}`,
        { encoding: 'utf8', cwd: ROOT }
      );
      const content = fs.readFileSync(modelPath, 'utf8');
      assert.match(content, /id: merge-tool-1/, 'tool ID must be merged');
      assert.match(content, /id: merge-mcp/, 'MCP server must be registered');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('3. Stdio-based server discovery executes JSON-RPC handshake', () => {
    const snapshotPath = path.resolve(ROOT, 'test-discover-stdio-snap.json');
    const serverScript = path.resolve(ROOT, 'test/commands/mock-mcp-server.js');
    try {
      const output = execSync(
        `node dist/index.js discover-mcp --mcp-id live-mcp --server node --args ${serverScript} --snapshot ${snapshotPath}`,
        { encoding: 'utf8', cwd: ROOT }
      );
      assert.match(output, /Connecting to MCP server via stdio:/, 'should report connecting');
      assert.match(output, /Discovered 1 tool\(s\)/, 'should discover 1 tool');

      assert.strictEqual(fs.existsSync(snapshotPath), true, 'snapshot file must be created');
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      assert.strictEqual(snapshot.mcp_id, 'live-mcp');
      assert.strictEqual(snapshot.tools[0].name, 'mock-tool-1');
    } finally {
      cleanup(snapshotPath);
    }
  });

  await t.test('4. Stdio discovery preserves spaced server arguments with --arg', () => {
    const snapshotPath = path.resolve(ROOT, 'test-discover-stdio-arg-snap.json');
    const serverScript = path.resolve(ROOT, 'test/commands/mock-mcp-server.js');
    try {
      execSync(
        `node dist/index.js discover-mcp --mcp-id live-mcp --server node --arg ${serverScript} "hello world" --snapshot ${snapshotPath}`,
        { encoding: 'utf8', cwd: ROOT }
      );

      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      assert.strictEqual(snapshot.tools[0].description, 'A mock tool with spaced arg');
    } finally {
      cleanup(snapshotPath);
    }
  });

  await t.test('5. Stdio discovery reports early server failures with stderr context', () => {
    const snapshotPath = path.resolve(ROOT, 'test-discover-fail-snap.json');
    const serverScript = path.resolve(ROOT, 'test/commands/mock-mcp-server.js');
    try {
      assert.throws(() => {
        execSync(
          `node dist/index.js discover-mcp --mcp-id broken-mcp --server node --args "${serverScript} --fail-fast" --snapshot ${snapshotPath}`,
          { encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }
        );
      }, (error: unknown) => {
        const stderr = String((error as { stderr?: Buffer | string }).stderr || '');
        assert.match(stderr, /closed before discovery completed/, 'error should identify early close');
        assert.match(stderr, /mock MCP startup boom/, 'error should include server stderr context');
        return true;
      });
      assert.strictEqual(fs.existsSync(snapshotPath), false, 'failed discovery must not write a snapshot');
    } finally {
      cleanup(snapshotPath);
    }
  });
});
