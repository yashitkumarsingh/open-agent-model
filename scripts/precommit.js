import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Running pre-commit quality checks...');

try {
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 22) {
    console.error(`\x1b[31m✘ Node ${process.version} is unsupported. Run 'nvm use' to switch to Node 22 before committing.\x1b[0m`);
    process.exit(1);
  }

  // 1. Build project
  console.log('Compiling TypeScript codebase...');
  execSync('npm run build', { stdio: 'inherit' });

  // 1.5 Run Unit Tests and coverage against the freshly compiled output
  console.log('Running automated unit tests with coverage threshold...');
  execSync('npm run coverage:compiled', { stdio: 'inherit' });

  console.log('Validating agentmodel.yaml...');
  execSync('node dist/index.js validate -i agentmodel.yaml', { stdio: 'inherit' });

  // 3. Validate examples
  console.log('Validating reference example files...');
  const examplesDir = './examples';
  const files = fs.readdirSync(examplesDir);
  for (const file of files) {
    if (file.endsWith('.yaml') && file !== 'invalid-references.yaml') {
      console.log(`Checking examples/${file}...`);
      execSync(`node dist/index.js validate -i examples/${file}`, { stdio: 'inherit' });
    }
  }

  // 4. Verify Drift Detection flags threats correctly
  console.log('Verifying that drift detector successfully blocks unauthorized traces...');
  try {
    execSync('node dist/index.js drift -i agentmodel.yaml -t examples/drift-traces.json', { stdio: 'pipe' });
    console.error('\x1b[31m✘ Failed: Drift detector should have returned code 1 but returned 0 instead!\x1b[0m');
    process.exit(1);
  } catch (err) {
    console.log('\x1b[32m✔ Success: Drift detector correctly identified violations and blocked execution.\x1b[0m');
  }

  console.log('\x1b[32m✔ All pre-commit checks PASSED!\x1b[0m');
  process.exit(0);
} catch (error) {
  console.error('\x1b[31m✘ Pre-commit checks FAILED!\x1b[0m');
  process.exit(1);
}
