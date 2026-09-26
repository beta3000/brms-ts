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
import { isFieldReference } from '../engine/field-access.js';
import type { Action } from '../model/action.js';
import type {
  BinaryComparisonOperator,
  Condition,
  UnaryComparisonOperator,
} from '../model/condition.js';
import type { Fact, FactAttributes, FactValue } from '../model/fact.js';
import type { Rule } from '../model/rule.js';
import { DEFAULT_SALIENCE } from '../model/rule.js';
import { validateRegexPattern } from './regex-guard.js';
import type { RulesDocument } from './schema.js';
import { rulesDocumentSchema } from './schema.js';

const ajv = new Ajv({ allErrors: true });
const validateDocument = ajv.compile<RulesDocument>(rulesDocumentSchema);

const BINARY_COMPARISON_OPERATORS: ReadonlySet<string> = new Set<BinaryComparisonOperator>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
  'between',
  'startsWith',
  'endsWith',
  'matches',
]);

const UNARY_COMPARISON_OPERATORS: ReadonlySet<string> = new Set<UnaryComparisonOperator>([
  'isEmpty',
  'exists',
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
    const type = mapType(rule.type, path, details);

    if (when !== undefined) {
      rules.push({
        name: rule.name,
        salience: rule.salience ?? DEFAULT_SALIENCE,
        noLoop: rule.noLoop ?? false,
        ...(type === undefined ? {} : { type }),
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
 * Validates and maps the optional fact type selector of a rule.
 *
 * @returns The accepted selector, or `undefined` when absent or invalid (with
 *   a detail pushed onto `details`).
 */
function mapType(
  value: unknown,
  path: string,
  details: string[],
): string | readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item: unknown): item is string => typeof item === 'string' && item.length > 0)
  ) {
    return value;
  }
  details.push(
    `${path}.type: "type" must be a non-empty string or a non-empty array of non-empty strings.`,
  );
  return undefined;
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
  if (typeof operator !== 'string' || !isComparisonOperator(operator)) {
    details.push(
      `${path}: comparison "operator" must be one of ${[...BINARY_COMPARISON_OPERATORS, ...UNARY_COMPARISON_OPERATORS].join(', ')}.`,
    );
    return undefined;
  }
  if (UNARY_COMPARISON_OPERATORS.has(operator)) {
    if ('value' in node) {
      details.push(`${path}: operator "${operator}" must not declare "value".`);
      return undefined;
    }
    return { kind: 'comparison', field, operator: operator as UnaryComparisonOperator };
  }
  if (!('value' in node)) {
    details.push(`${path}: comparison "value" is required for operator "${operator}".`);
    return undefined;
  }
  const value = node['value'];
  if (!isRuleValue(value)) {
    details.push(`${path}: comparison "value" must be a valid fact value.`);
    return undefined;
  }
  if (!isValidValueForOperator(operator as BinaryComparisonOperator, value, path, details)) {
    return undefined;
  }
  return { kind: 'comparison', field, operator: operator as BinaryComparisonOperator, value };
}

/**
 * Determines whether a string is a known comparison operator.
 */
function isComparisonOperator(operator: string): boolean {
  return BINARY_COMPARISON_OPERATORS.has(operator) || UNARY_COMPARISON_OPERATORS.has(operator);
}

/**
 * Applies the operator-specific shape rules to a comparison value.
 *
 * @returns `true` when the value is acceptable (with a detail pushed onto
 *   `details` otherwise).
 */
function isValidValueForOperator(
  operator: BinaryComparisonOperator,
  value: FactValue,
  path: string,
  details: string[],
): boolean {
  switch (operator) {
    case 'startsWith':
    case 'endsWith':
      if (typeof value !== 'string' && !isFieldReference(value)) {
        details.push(
          `${path}: comparison "value" for "${operator}" must be a string or a $fact reference.`,
        );
        return false;
      }
      return true;
    case 'matches': {
      if (typeof value !== 'string') {
        details.push(
          `${path}: comparison "value" for "matches" must be a literal string pattern (no $fact references).`,
        );
        return false;
      }
      const problem = validateRegexPattern(value);
      if (problem !== undefined) {
        details.push(`${path}.value: ${problem}`);
        return false;
      }
      return true;
    }
    case 'between':
      if (!isFieldReference(value) && !isBetweenRange(value)) {
        details.push(
          `${path}: comparison "value" for "between" must be [min, max] with two numbers or two strings.`,
        );
        return false;
      }
      return true;
    default:
      return true;
  }
}

/**
 * Determines whether a rule value is a valid `[min, max]` range of two numbers
 * or two strings.
 */
function isBetweenRange(value: FactValue): boolean {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [min, max] = value;
  if (min === undefined || max === undefined) {
    return false;
  }
  return (
    (typeof min === 'number' && typeof max === 'number') ||
    (typeof min === 'string' && typeof max === 'string')
  );
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
      if (!isRecord(attributes) || !isRuleAttributes(attributes)) {
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
  if (!isRecord(attributes) || !isRuleAttributes(attributes)) {
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
  if (!Array.isArray(value) || !value.every(isRuleValue)) {
    details.push(`${path}: "args" must be an array of fact values.`);
    return undefined;
  }
  return value;
}

/**
 * Type guard for a rule value: a {@link FactValue} or a well-formed
 * {@link FieldReference}.
 *
 * An object carrying a `$fact` key is only accepted when it is a valid
 * reference (`$fact` as a non-empty string and no other keys); any other use
 * of the reserved key is rejected.
 */
function isRuleValue(value: unknown): value is FactValue {
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
        return value.every(isRuleValue);
      }
      return isRuleAttributes(value as Record<string, unknown>);
    default:
      return false;
  }
}

/**
 * Type guard for a rule attributes object: every value is a rule value, and a
 * `$fact` key is only accepted when it forms a valid field reference.
 */
function isRuleAttributes(value: Record<string, unknown>): value is FactAttributes {
  if (Object.prototype.hasOwnProperty.call(value, '$fact')) {
    return isFieldReference(value as FactValue);
  }
  return Object.values(value).every(isRuleValue);
}
