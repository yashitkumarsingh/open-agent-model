import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import AjvModule, { ErrorObject, ValidateFunction, Options, Ajv as AjvInstance } from 'ajv';
import addFormatsModule, { FormatsPlugin } from 'ajv-formats';
import { SystemModel } from '../core/model.js';
import { linkAndValidateSystemModel } from '../core/linker.js';

const Ajv = (
  (AjvModule as unknown as { default: new (opts?: Options) => AjvInstance }).default ||
  (AjvModule as unknown as new (opts?: Options) => AjvInstance)
);

const addFormats = (
  (addFormatsModule as unknown as { default: FormatsPlugin }).default ||
  (addFormatsModule as unknown as FormatsPlugin)
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedValidate: ValidateFunction | null = null;

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
  } catch (error: unknown) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
  }

  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`] };
  }

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, 'utf8');
  } catch (error: unknown) {
    return { valid: false, errors: [`Failed to read file: ${error instanceof Error ? error.message : String(error)}`] };
  }

  let data: unknown;
  try {
    data = yaml.load(fileContent);
  } catch (error: unknown) {
    return { valid: false, errors: [`YAML parsing error: ${error instanceof Error ? error.message : String(error)}`] };
  }

  let validate = cachedValidate;

  if (!validate) {
    // Load the schema
    const schemaPath = path.resolve(__dirname, '../../packages/schema/agentmodel.schema.json');
    if (!fs.existsSync(schemaPath)) {
      return { valid: false, errors: [`Schema file not found at ${schemaPath}`], data: data as SystemModel };
    }

    let schema: unknown;
    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    } catch (error: unknown) {
      return { valid: false, errors: [`Failed to parse schema JSON: ${error instanceof Error ? error.message : String(error)}`], data: data as SystemModel };
    }

    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    
    validate = ajv.compile(schema as Record<string, unknown>);
    cachedValidate = validate;
  }

  if (!validate) {
    return { valid: false, errors: ['Failed to compile or load schema'], data: data as SystemModel };
  }

  const valid = validate(data);

  if (!valid) {
    const errors = validate.errors?.map((err: ErrorObject) => {
      const field = err.instancePath ? `Field '${err.instancePath}'` : 'Root';
      return `${field}: ${err.message}${err.params ? ' ' + JSON.stringify(err.params) : ''}`;
    }) || ['Unknown validation error'];
    return { valid: false, errors, data: data as SystemModel };
  }

  // Run referential / semantic validation
  const linkerErrors = linkAndValidateSystemModel(data as SystemModel, { now });
  if (linkerErrors.length > 0) {
    return { valid: false, errors: linkerErrors, data: data as SystemModel };
  }

  return { valid: true, data: data as SystemModel };
}

export function validateCommand(options: { input: string; asOf?: string }): number {
  const inputPath = path.resolve(options.input);
  console.log(`Validating ${inputPath}...`);
  
  const result = validateYaml(inputPath, { asOf: options.asOf });
  
  if (result.valid) {
    console.log(`\x1b[32m✔ OpenAgentModel config at ${options.input} is VALID!\x1b[0m`);
    return 0;
  } else {
    console.error(`\x1b[31m✘ Validation failed for ${options.input}:\x1b[0m`);
    result.errors?.forEach((err) => console.error(`  - ${err}`));
    return 1;
  }
}
