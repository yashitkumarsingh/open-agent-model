import readline from 'readline';

if (process.argv.includes('--fail-fast')) {
  console.error('mock MCP startup boom');
  process.exit(42);
}

const extraArgs = process.argv.slice(2);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'mock-mcp', version: '1.0.0' }
        }
      }));
    } else if (req.method === 'tools/list') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: [
            {
              name: 'mock-tool-1',
              description: extraArgs.includes('hello world') ? 'A mock tool with spaced arg' : 'A mock tool',
              inputSchema: { type: 'object', properties: {} }
            }
          ]
        }
      }));
    }
  } catch (e) {}
});
