/**
 * bridge.json describes every message that crosses the Lua <-> UI boundary.
 *
 * {
 *   "toUi":     { "<action>": { <fields> } },                       // Lua  -> UI  (SendNUIMessage)
 *   "toClient": { "<name>":   { "request": {..}, "response": {..} } } // UI -> Lua (fetchNui / RegisterNUICallback)
 * }
 *
 * A field is one of:
 *   "string" | "number" | "boolean" | "any"   primitive
 *   "number[]"                                 array (suffix [])
 *   "string?"  or key "name?"                  optional
 *   { ...fields }                              nested object
 *   [ <field> ]                                array of that field (e.g. [{ "id": "number" }])
 */

export type Primitive = 'string' | 'number' | 'boolean' | 'any';

export type TypeNode =
  | { kind: 'primitive'; name: Primitive }
  | { kind: 'object'; fields: Field[] }
  | { kind: 'array'; of: TypeNode };

export interface Field {
  name: string;
  optional: boolean;
  type: TypeNode;
}

export interface UiMessage {
  name: string;
  fields: Field[];
}

export interface NuiCallback {
  name: string;
  request: Field[];
  response: Field[];
}

export interface Bridge {
  toUi: UiMessage[];
  toClient: NuiCallback[];
}

export class BridgeError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`bridge.json has ${issues.length} problem(s):\n  - ${issues.join('\n  - ')}`);
    this.name = 'BridgeError';
    this.issues = issues;
  }
}

const PRIMITIVES: readonly Primitive[] = ['string', 'number', 'boolean', 'any'];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Message names become Lua function names (Ui.<name>, Nui.<name>), so they cannot be Lua keywords.
const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkMessageName(name: string, path: string, issues: string[]): void {
  if (!IDENT.test(name)) issues.push(`${path}: "${name}" is not a valid name (use letters, digits and _)`);
  else if (LUA_KEYWORDS.has(name)) issues.push(`${path}: "${name}" is a Lua keyword and cannot be a message name`);
}

function parseTypeString(raw: string, path: string, issues: string[]): { type: TypeNode; optional: boolean } | null {
  let s = raw.trim();
  let optional = false;
  if (s.endsWith('?')) {
    optional = true;
    s = s.slice(0, -1);
  }
  let depth = 0;
  while (s.endsWith('[]')) {
    depth++;
    s = s.slice(0, -2);
  }
  if (!PRIMITIVES.includes(s as Primitive)) {
    issues.push(`${path}: unknown type "${raw}" (expected ${PRIMITIVES.join(', ')}, optionally with [] or ?)`);
    return null;
  }
  let type: TypeNode = { kind: 'primitive', name: s as Primitive };
  for (let i = 0; i < depth; i++) type = { kind: 'array', of: type };
  return { type, optional };
}

function parseValue(value: unknown, path: string, issues: string[]): { type: TypeNode; optional: boolean } | null {
  if (typeof value === 'string') return parseTypeString(value, path, issues);
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      issues.push(`${path}: an array type must have exactly one element describing its items, e.g. [{ "id": "number" }]`);
      return null;
    }
    const inner = parseValue(value[0], `${path}[]`, issues);
    if (!inner) return null;
    if (inner.optional) issues.push(`${path}[]: array items cannot be optional`);
    return { type: { kind: 'array', of: inner.type }, optional: false };
  }
  if (isPlainObject(value)) {
    return { type: { kind: 'object', fields: parseFields(value, path, issues) }, optional: false };
  }
  issues.push(`${path}: expected a type string, an object or a one-element array`);
  return null;
}

export function parseFields(obj: unknown, path: string, issues: string[]): Field[] {
  if (obj === undefined) return [];
  if (!isPlainObject(obj)) {
    issues.push(`${path}: expected an object of fields`);
    return [];
  }
  const fields: Field[] = [];
  for (const [rawKey, value] of Object.entries(obj)) {
    if (rawKey.startsWith('$')) continue; // allow "$comment" style keys
    const keyOptional = rawKey.endsWith('?');
    const name = keyOptional ? rawKey.slice(0, -1) : rawKey;
    const fieldPath = `${path}.${name}`;
    if (!IDENT.test(name)) {
      issues.push(`${fieldPath}: "${name}" is not a valid field name`);
      continue;
    }
    const parsed = parseValue(value, fieldPath, issues);
    if (!parsed) continue;
    fields.push({ name, optional: keyOptional || parsed.optional, type: parsed.type });
  }
  return fields;
}

/** Validate raw JSON and turn it into a Bridge. Throws BridgeError listing every problem at once. */
export function parseBridge(json: unknown): Bridge {
  const issues: string[] = [];
  if (!isPlainObject(json)) throw new BridgeError(['the file must contain a JSON object']);

  for (const key of Object.keys(json)) {
    if (key !== 'toUi' && key !== 'toClient' && !key.startsWith('$')) {
      issues.push(`unknown top-level key "${key}" (expected "toUi" and "toClient")`);
    }
  }

  const toUi: UiMessage[] = [];
  if (json.toUi !== undefined) {
    if (!isPlainObject(json.toUi)) issues.push('toUi: expected an object');
    else {
      for (const [name, fields] of Object.entries(json.toUi)) {
        if (name.startsWith('$')) continue;
        checkMessageName(name, `toUi.${name}`, issues);
        toUi.push({ name, fields: parseFields(fields, `toUi.${name}`, issues) });
      }
    }
  }

  const toClient: NuiCallback[] = [];
  if (json.toClient !== undefined) {
    if (!isPlainObject(json.toClient)) issues.push('toClient: expected an object');
    else {
      for (const [name, def] of Object.entries(json.toClient)) {
        if (name.startsWith('$')) continue;
        const path = `toClient.${name}`;
        checkMessageName(name, path, issues);
        if (!isPlainObject(def)) {
          issues.push(`${path}: expected { "request": {...}, "response": {...} }`);
          continue;
        }
        for (const k of Object.keys(def)) {
          if (k !== 'request' && k !== 'response' && !k.startsWith('$')) {
            issues.push(`${path}: unknown key "${k}" (expected "request" and "response")`);
          }
        }
        toClient.push({
          name,
          request: parseFields(def.request, `${path}.request`, issues),
          response: parseFields(def.response, `${path}.response`, issues),
        });
      }
    }
  }

  if (issues.length > 0) throw new BridgeError(issues);
  return { toUi, toClient };
}
