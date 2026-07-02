import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

/** Write a temp agentmodel YAML and return its path. */
function writeTempModel(name: string): string {
  const p = path.resolve(ROOT, `test-import-${name}.yaml`);
  fs.writeFileSync(p, `system: import-test-${name}\nversion: "1.0"\nagents:\n  - id: agent-a\n    purpose: "Test"\n`, 'utf8');
  return p;
}

/** Write a temp tools JSON file and return its path. */
function writeTempTools(name: string, content: unknown): string {
  const p = path.resolve(ROOT, `test-tools-${name}.json`);
  fs.writeFileSync(p, JSON.stringify(content, null, 2), 'utf8');
  return p;
}

/** Clean up temp files created during a test. */
function cleanup(...paths: string[]): void {
  for (const p of paths) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

test('MCP Import Command Test Suite', async (t) => {

  await t.test('1. Valid tools file imports successfully', () => {
    const modelPath = writeTempModel('valid');
    const toolsPath = writeTempTools('valid', [
      { name: 'create-ticket', description: 'Creates a support ticket', inputSchema: { type: 'object' } },
      { name: 'close-ticket', description: 'Closes a ticket' }
    ]);
    try {
      const out = execSync(
        `node dist/index.js import-mcp --input ${modelPath} --mcp-id vendor-mcp --trust-level external --tools-file ${toolsPath}`,
        { encoding: 'utf8', cwd: ROOT }
      );
      assert.match(out, /Successfully imported/, 'Valid import should succeed');

      // Verify YAML was updated
      const content = fs.readFileSync(modelPath, 'utf8');
      assert.match(content, /create-ticket/, 'create-ticket tool should appear in output YAML');
      assert.match(content, /vendor-mcp/, 'MCP server ID should appear in output YAML');
      assert.match(content, /kind: mcp/, 'Source provenance kind should be written');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('2. Tool missing name field is rejected', () => {
    const modelPath = writeTempModel('missing-name');
    const toolsPath = writeTempTools('missing-name', [
      { description: 'No name here' }
    ]);
    try {
      assert.throws(() => {
        execSync(
          `node dist/index.js import-mcp --input ${modelPath} --mcp-id bad-mcp --trust-level external --tools-file ${toolsPath}`,
          { stdio: 'pipe', cwd: ROOT }
        );
      }, /Command failed/, 'Missing name field should fail with exit code 1');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('3. Empty string name is rejected', () => {
    const modelPath = writeTempModel('empty-name');
    const toolsPath = writeTempTools('empty-name', [
      { name: '   ' }
    ]);
    try {
      assert.throws(() => {
        execSync(
          `node dist/index.js import-mcp --input ${modelPath} --mcp-id bad-mcp --trust-level external --tools-file ${toolsPath}`,
          { stdio: 'pipe', cwd: ROOT }
        );
      }, /Command failed/, 'Empty string name should fail with exit code 1');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('4. Duplicate tool names are rejected', () => {
    const modelPath = writeTempModel('duplicate');
    const toolsPath = writeTempTools('duplicate', [
      { name: 'same-tool' },
      { name: 'same-tool' }
    ]);
    try {
      assert.throws(() => {
        execSync(
          `node dist/index.js import-mcp --input ${modelPath} --mcp-id bad-mcp --trust-level external --tools-file ${toolsPath}`,
          { stdio: 'pipe', cwd: ROOT }
        );
      }, /Command failed/, 'Duplicate tool names should fail with exit code 1');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('5. Non-array tools file is rejected', () => {
    const modelPath = writeTempModel('non-array');
    const toolsPath = writeTempTools('non-array', { name: 'not-an-array' });
    try {
      assert.throws(() => {
        execSync(
          `node dist/index.js import-mcp --input ${modelPath} --mcp-id bad-mcp --trust-level external --tools-file ${toolsPath}`,
          { stdio: 'pipe', cwd: ROOT }
        );
      }, /Command failed/, 'Non-array tools file should fail with exit code 1');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('6. MCP annotations and input_schema are preserved in output', () => {
    const modelPath = writeTempModel('annotations');
    const toolsPath = writeTempTools('annotations', [
      {
        name: 'read-only-search',
        description: 'Read-only search tool',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false }
      }
    ]);
    try {
      execSync(
        `node dist/index.js import-mcp --input ${modelPath} --mcp-id search-mcp --trust-level internal --tools-file ${toolsPath}`,
        { encoding: 'utf8', cwd: ROOT }
      );
      const content = fs.readFileSync(modelPath, 'utf8');
      assert.match(content, /read_only_hint: true/, 'read_only_hint annotation should be preserved');
      assert.match(content, /idempotent_hint: true/, 'idempotent_hint annotation should be preserved');
      assert.match(content, /input_schema/, 'input_schema should be preserved in output YAML');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('7. Invalid --trust-level is rejected before file mutation', () => {
    const modelPath = writeTempModel('bad-trust');
    const toolsPath = writeTempTools('bad-trust', [{ name: 'some-tool' }]);
    const originalContent = fs.readFileSync(modelPath, 'utf8');
    try {
      let stderr = '';
      assert.throws(() => {
        const result = execSync(
          `node dist/index.js import-mcp --input ${modelPath} --mcp-id test-mcp --trust-level INVALID_LEVEL --tools-file ${toolsPath}`,
          { stdio: ['pipe', 'pipe', 'pipe'], cwd: ROOT, encoding: 'utf8' }
        );
      }, /Command failed/, 'Invalid trust-level should exit with error');
      // Original file must not have been modified
      const afterContent = fs.readFileSync(modelPath, 'utf8');
      assert.strictEqual(afterContent, originalContent, 'Original model file must be unchanged after invalid trust-level rejection');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('7b. Empty or missing --mcp-id is rejected before file mutation', () => {
    const modelPath = writeTempModel('bad-mcp-id');
    const toolsPath = writeTempTools('bad-mcp-id', [{ name: 'some-tool' }]);
    const originalContent = fs.readFileSync(modelPath, 'utf8');
    try {
      assert.throws(() => {
        execSync(
          `node dist/index.js import-mcp --input ${modelPath} --mcp-id "   " --trust-level external --tools-file ${toolsPath}`,
          { stdio: ['pipe', 'pipe', 'pipe'], cwd: ROOT, encoding: 'utf8' }
        );
      }, /Command failed/, 'Empty --mcp-id should exit with error');
      // Original file must not have been modified
      const afterContent = fs.readFileSync(modelPath, 'utf8');
      assert.strictEqual(afterContent, originalContent, 'Original model file must be unchanged after empty mcp-id rejection');
    } finally {
      cleanup(modelPath, toolsPath);
    }
  });

  await t.test('8. Original file is unchanged when post-mutation validation fails', () => {
    // Force a post-mutation schema failure by importing a tool whose ID contains an invalid character
    // according to the new schema ID pattern (minLength: 1, pattern: ^[A-Za-z0-9._:-]+$).
    // A tool named 'tool#invalid' is accepted by the importer's basic name check, but violates the
    // schema validation run on the temp file.
    const modelPath = writeTempModel('post-mutation');
    const toolsPath = writeTempTools('post-mutation', [{ name: 'tool#invalid' }]);
    const originalContent = fs.readFileSync(modelPath, 'utf8');
    const tempPath = `${modelPath}.oam-import.tmp`;
    try {
      assert.throws(() => {
        execSync(
          `node dist/index.js import-mcp --input ${modelPath} --mcp-id post-mcp --trust-level external --tools-file ${toolsPath}`,
          { stdio: ['pipe', 'pipe', 'pipe'], cwd: ROOT, encoding: 'utf8' }
        );
      }, /Command failed/, 'Importing a tool with an invalid ID pattern must fail post-mutation validation');

      // Temp file must NOT persist after validation fails (should be deleted)
      assert.strictEqual(fs.existsSync(tempPath), false, 'Temp file must be cleaned up on validation failure');

      // Original file must not have been overwritten or modified
      const afterContent = fs.readFileSync(modelPath, 'utf8');
      assert.strictEqual(afterContent, originalContent, 'Original model file must remain unchanged on validation failure');
    } finally {
      cleanup(modelPath, toolsPath, tempPath);
    }
  });

});
