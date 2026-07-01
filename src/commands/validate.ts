import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import { SystemModel } from '../core/model.js';
import { linkAndValidateSystemModel } from '../core/linker.js';

const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ValidateYamlOptions {
  asOf?: string;
}

function parseAsOfDate(asOf?: string): Date | undefined {
  if (!asOf) return undefined;
  const parsed = new Date(asOf);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --as-of value '${asOf}'. Use YYYY-MM-DD or an ISO date-time string.`);
  }
  return parsed;
}

// Helper to load and validate YAML content against the schema
export function validateYaml(filePath: string, options: ValidateYamlOptions = {}): { valid: boolean; errors?: string[]; data?: SystemModel } {
  let now: Date | undefined;
  try {
    now = parseAsOfDate(options.asOf);
  } catch (error: any) {
    return { valid: false, errors: [error?.message || String(error)] };
  }

  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`] };
  }

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, 'utf8');
  } catch (error: any) {
    return { valid: false, errors: [`Failed to read file: ${error?.message || error}`] };
  }

  let data: any;
  try {
    data = yaml.load(fileContent);
  } catch (error: any) {
    return { valid: false, errors: [`YAML parsing error: ${error?.message || error}`] };
  }

  // Load the schema
  const schemaPath = path.resolve(__dirname, '../../packages/schema/agentmodel.schema.json');
  if (!fs.existsSync(schemaPath)) {
    return { valid: false, errors: [`Schema file not found at ${schemaPath}`], data };
  }

  let schema: any;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (error: any) {
    return { valid: false, errors: [`Failed to parse schema JSON: ${error?.message || error}`], data };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (!valid) {
    const errors = validate.errors?.map((err: any) => {
      const field = err.instancePath ? `Field '${err.instancePath}'` : 'Root';
      return `${field}: ${err.message}${err.params ? ' ' + JSON.stringify(err.params) : ''}`;
    }) || ['Unknown validation error'];
    return { valid: false, errors, data };
  }

  // Run referential / semantic validation
  const linkerErrors = linkAndValidateSystemModel(data, { now });
  if (linkerErrors.length > 0) {
    return { valid: false, errors: linkerErrors, data };
  }

  return { valid: true, data };
}

export function validateCommand(options: { input: string; asOf?: string }) {
  const inputPath = path.resolve(options.input);
  console.log(`Validating ${inputPath}...`);
  
  const result = validateYaml(inputPath, { asOf: options.asOf });
  
  if (result.valid) {
    console.log(`\x1b[32m✔ OpenAgentModel config at ${options.input} is VALID!\x1b[0m`);
    process.exit(0);
  } else {
    console.error(`\x1b[31m✘ Validation failed for ${options.input}:\x1b[0m`);
    result.errors?.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }
}
