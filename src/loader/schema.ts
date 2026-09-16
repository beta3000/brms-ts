/**
 * JSON Schema describing the declarative rules document format.
 *
 * The schema is the single source of truth for the structural validation of
 * rule data loaded from untrusted JSON or YAML. It mirrors the domain model in
 * `src/model`. Deep validation of the recursive condition and action trees is
 * performed by the loader mapping step, which produces clearer, path-aware
 * error messages than a monolithic schema.
 *
 * @packageDocumentation
 */

import type { SchemaObject } from 'ajv';

/**
 * A rules document: a top-level object with a `rules` array.
 *
 * @public
 */
export interface RulesDocument {
  /**
   * The rules declared in the document.
   */
  readonly rules: readonly RuleDocument[];
}

/**
 * A single rule as it appears in a document (before defaults are applied).
 *
 * @public
 */
export interface RuleDocument {
  /**
   * Unique rule name.
   */
  readonly name: string;
  /**
   * Optional salience/priority.
   */
  readonly salience?: number;
  /**
   * Optional `no-loop` flag.
   */
  readonly noLoop?: boolean;
  /**
   * The `when` condition tree (refined by the loader mapping step).
   */
  readonly when: unknown;
  /**
   * The `then` actions (refined by the loader mapping step).
   */
  readonly then: readonly unknown[];
}

/**
 * Ajv schema for a {@link RulesDocument}.
 *
 * Validates the document envelope and the scalar fields of each rule. The
 * `when` object and `then` array elements are only checked to be objects here;
 * their internal structure is validated during mapping.
 *
 * @public
 */
export const rulesDocumentSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['rules'],
  properties: {
    rules: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'when', 'then'],
        properties: {
          name: { type: 'string', minLength: 1 },
          salience: { type: 'number' },
          noLoop: { type: 'boolean' },
          when: {},
          then: { type: 'array' },
        },
      },
    },
  },
};
