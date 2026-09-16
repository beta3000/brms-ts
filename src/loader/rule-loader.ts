/**
 * Loading and validation of rules from JSON or YAML.
 *
 * Rule data is treated as untrusted input: it is parsed with a safe YAML/JSON
 * loader (no code execution), validated structurally with Ajv, then mapped onto
 * the strongly typed domain model with additional semantic checks. Any problem
 * raises a {@link ValidationError} carrying a list of human-readable details.
 *
 * @packageDocumentation
 */

import { Ajv } from 'ajv';
import type { ErrorObject } from 'ajv';
import { load as loadYaml } from 'js-yaml';

import { ValidationError } from '../engine/errors.js';
import type { Action } from '../model/action.js';
import type { ComparisonOperator, Condition } from '../model/condition.js';
import type { Fact, FactAttributes, FactValue } from '../model/fact.js';
import type { Rule } from '../model/rule.js';
import { DEFAULT_SALIENCE } from '../model/rule.js';
import type { RulesDocument } from './schema.js';
import { rulesDocumentSchema } from './schema.js';

const ajv = new Ajv({ allErrors: true });
const validateDocument = ajv.compile<RulesDocument>(rulesDocumentSchema);

const COMPARISON_OPERATORS: ReadonlySet<string> = new Set<ComparisonOperator>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
]);

/**
 * Parses and validates rules from a JSON or YAML string.
 *
 * @param source - Raw JSON or YAML text containing a rules document.
 * @returns The validated, typed list of rules with defaults applied.
 * @throws {@link ValidationError} if the source cannot be parsed or does not
 *   conform to the rules format.
 *
 * @example
 * ```ts
 * const rules = loadRulesFromString(`
 * rules:
 *   - name: adult
 *     when: { kind: comparison, field: age, operator: gte, value: 18 }
 *     then:
 *       - { kind: invoke, function: markAdult }
 * `);
 * ```
 *
 * @public
 */
export function loadRulesFromString(source: string): readonly Rule[] {
  let parsed: unknown;
  try {
    // js-yaml's default schema is a superset of JSON and executes no code.
    parsed = loadYaml(source);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ValidationError('Failed to parse rules source as JSON/YAML.', [reason]);
  }
  return mapDocument(parsed);
}

/**
 * Validates an already-parsed value as a rules document and maps it onto the
 * typed model.
 *
 * @param parsed - A value produced by parsing JSON or YAML.
 * @returns The validated, typed list of rules with defaults applied.
 * @throws {@link ValidationError} if the value does not conform.
 *
 * @public
 */
export function loadRulesFromObject(parsed: unknown): readonly Rule[] {
  return mapDocument(parsed);
}

/**
 * Validates the document shape and maps each rule.
 */
function mapDocument(parsed: unknown): readonly Rule[] {
  if (!validateDocument(parsed)) {
    const details = (validateDocument.errors ?? []).map(
      (err: ErrorObject) => `${err.instancePath || '(root)'} ${err.message ?? 'is invalid'}`,
    );
    throw new ValidationError('Invalid rules document.', details);
  }

  const details: string[] = [];
  const rules: Rule[] = [];
  const seenNames = new Set<string>();

  parsed.rules.forEach((rule, index) => {
    const path = `rules[${String(index)}] (${rule.name})`;
    if (seenNames.has(rule.name)) {
      details.push(`${path}: duplicate rule name "${rule.name}".`);
    }
    seenNames.add(rule.name);

    const when = mapCondition(rule.when, `${path}.when`, details);
    const then = mapActions(rule.then, `${path}.then`, details);

    if (when !== undefined) {
      rules.push({
        name: rule.name,
        salience: rule.salience ?? DEFAULT_SALIENCE,
        noLoop: rule.noLoop ?? false,
        when,
        then,
      });
    }
  });

  if (details.length > 0) {
    throw new ValidationError('Invalid rules document.', details);
  }

  return rules;
}

/**
 * Determines whether an unknown value is a plain record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Maps and validates a condition node recursively.
 *
 * @returns The typed condition, or `undefined` when invalid (with details
 *   pushed onto `details`).
 */
function mapCondition(node: unknown, path: string, details: string[]): Condition | undefined {
  if (!isRecord(node) || typeof node['kind'] !== 'string') {
    details.push(`${path}: condition must be an object with a string "kind".`);
    return undefined;
  }
  const kind = node['kind'];
  switch (kind) {
    case 'comparison':
      return mapComparison(node, path, details);
    case 'predicate':
      return mapPredicate(node, path, details);
    case 'and':
    case 'or':
      return mapAndOr(kind, node, path, details);
    case 'not': {
      const inner = mapCondition(node['condition'], `${path}.condition`, details);
      return inner === undefined ? undefined : { kind: 'not', condition: inner };
    }
    default:
      details.push(`${path}: unknown condition kind "${kind}".`);
      return undefined;
  }
}

/**
 * Maps a comparison condition.
 */
function mapComparison(
  node: Record<string, unknown>,
  path: string,
  details: string[],
): Condition | undefined {
  const field = node['field'];
  const operator = node['operator'];
  if (typeof field !== 'string' || field.length === 0) {
    details.push(`${path}: comparison "field" must be a non-empty string.`);
    return undefined;
  }
  if (typeof operator !== 'string' || !COMPARISON_OPERATORS.has(operator)) {
    details.push(
      `${path}: comparison "operator" must be one of ${[...COMPARISON_OPERATORS].join(', ')}.`,
    );
    return undefined;
  }
  if (!isFactValue(node['value'])) {
    details.push(`${path}: comparison "value" must be a valid fact value.`);
    return undefined;
  }
  return {
    kind: 'comparison',
    field,
    operator: operator as ComparisonOperator,
    value: node['value'],
  };
}

/**
 * Maps a predicate condition.
 */
function mapPredicate(
  node: Record<string, unknown>,
  path: string,
  details: string[],
): Condition | undefined {
  const name = node['predicate'];
  if (typeof name !== 'string' || name.length === 0) {
    details.push(`${path}: predicate "predicate" must be a non-empty string.`);
    return undefined;
  }
  const args = mapArgs(node['args'], path, details);
  if (args === undefined) {
    return undefined;
  }
  return args.length > 0
    ? { kind: 'predicate', predicate: name, args }
    : { kind: 'predicate', predicate: name };
}

/**
 * Maps an `and`/`or` condition.
 */
function mapAndOr(
  kind: 'and' | 'or',
  node: Record<string, unknown>,
  path: string,
  details: string[],
): Condition | undefined {
  const raw = node['conditions'];
  if (!Array.isArray(raw) || raw.length === 0) {
    details.push(`${path}: "${kind}" requires a non-empty "conditions" array.`);
    return undefined;
  }
  const mapped: Condition[] = [];
  raw.forEach((child, index) => {
    const c = mapCondition(child, `${path}.conditions[${String(index)}]`, details);
    if (c !== undefined) {
      mapped.push(c);
    }
  });
  if (mapped.length !== raw.length) {
    return undefined;
  }
  return { kind, conditions: mapped };
}

/**
 * Maps and validates the action list.
 */
function mapActions(nodes: readonly unknown[], path: string, details: string[]): Action[] {
  const actions: Action[] = [];
  nodes.forEach((node, index) => {
    const action = mapAction(node, `${path}[${String(index)}]`, details);
    if (action !== undefined) {
      actions.push(action);
    }
  });
  return actions;
}

/**
 * Maps and validates a single action node.
 */
function mapAction(node: unknown, path: string, details: string[]): Action | undefined {
  if (!isRecord(node) || typeof node['kind'] !== 'string') {
    details.push(`${path}: action must be an object with a string "kind".`);
    return undefined;
  }
  const kind = node['kind'];
  switch (kind) {
    case 'insert': {
      const fact = mapFact(node['fact'], `${path}.fact`, details);
      return fact === undefined ? undefined : { kind: 'insert', fact };
    }
    case 'modify': {
      const target = mapTarget(node['target'], path, details);
      const attributes = node['attributes'];
      if (!isRecord(attributes) || !isFactAttributes(attributes)) {
        details.push(`${path}: modify "attributes" must be an object of fact values.`);
        return undefined;
      }
      return target === undefined ? undefined : { kind: 'modify', target, attributes };
    }
    case 'retract': {
      const target = mapTarget(node['target'], path, details);
      return target === undefined ? undefined : { kind: 'retract', target };
    }
    case 'invoke': {
      const name = node['function'];
      if (typeof name !== 'string' || name.length === 0) {
        details.push(`${path}: invoke "function" must be a non-empty string.`);
        return undefined;
      }
      const args = mapArgs(node['args'], path, details);
      if (args === undefined) {
        return undefined;
      }
      return args.length > 0
        ? { kind: 'invoke', function: name, args }
        : { kind: 'invoke', function: name };
    }
    default:
      details.push(`${path}: unknown action kind "${kind}".`);
      return undefined;
  }
}

/**
 * Validates a zero-based target index.
 */
function mapTarget(value: unknown, path: string, details: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    details.push(`${path}: "target" must be a non-negative integer.`);
    return undefined;
  }
  return value;
}

/**
 * Validates and maps a fact node.
 */
function mapFact(node: unknown, path: string, details: string[]): Fact | undefined {
  if (!isRecord(node) || typeof node['type'] !== 'string' || node['type'].length === 0) {
    details.push(`${path}: fact must have a non-empty string "type".`);
    return undefined;
  }
  const attributes = node['attributes'];
  if (!isRecord(attributes) || !isFactAttributes(attributes)) {
    details.push(`${path}: fact "attributes" must be an object of fact values.`);
    return undefined;
  }
  return { type: node['type'], attributes };
}

/**
 * Validates optional argument arrays.
 *
 * @returns The argument list (empty when absent), or `undefined` when invalid.
 */
function mapArgs(
  value: unknown,
  path: string,
  details: string[],
): readonly FactValue[] | undefined {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isFactValue)) {
    details.push(`${path}: "args" must be an array of fact values.`);
    return undefined;
  }
  return value;
}

/**
 * Type guard for {@link FactValue}.
 */
function isFactValue(value: unknown): value is FactValue {
  if (value === null) {
    return true;
  }
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return true;
    case 'object':
      if (Array.isArray(value)) {
        return value.every(isFactValue);
      }
      return isFactAttributes(value as Record<string, unknown>);
    default:
      return false;
  }
}

/**
 * Type guard for {@link FactAttributes}.
 */
function isFactAttributes(value: Record<string, unknown>): value is FactAttributes {
  return Object.values(value).every(isFactValue);
}
