/**
 * Types for the **facts** model of the working memory.
 *
 * A fact represents a piece of data known to the engine, against which rules
 * are evaluated. It is analogous to an object inserted into the working memory
 * in Drools.
 *
 * @packageDocumentation
 */

/**
 * Primitive value allowed inside a fact.
 *
 * @public
 */
export type FactPrimitive = string | number | boolean | null;

/**
 * Value allowed for a fact field: a primitive, an array of values, or a nested
 * object of values.
 *
 * @public
 */
export type FactValue = FactPrimitive | FactValue[] | { readonly [key: string]: FactValue };

/**
 * Set of fact attributes, indexed by field name.
 *
 * @public
 */
export type FactAttributes = Readonly<Record<string, FactValue>>;

/**
 * A fact in the working memory.
 *
 * Every fact has a `type` (equivalent to the object/class type in Drools, used
 * to select which rules apply) and a set of attributes holding the fact data.
 *
 * @typeParam TAttributes - Concrete shape of the fact attributes.
 *
 * @public
 */
export interface Fact<TAttributes extends FactAttributes = FactAttributes> {
  /**
   * Fact discriminator (for example `"Customer"` or `"Order"`).
   */
  readonly type: string;
  /**
   * Attributes holding the fact data.
   */
  readonly attributes: TAttributes;
}

/**
 * Unique identifier of a fact within the working memory.
 *
 * It is assigned when the fact is inserted and allows it to be modified or
 * retracted later.
 *
 * @public
 */
export type FactId = string;

/**
 * A fact already registered in the working memory, together with its
 * identifier.
 *
 * @typeParam TAttributes - Concrete shape of the fact attributes.
 *
 * @public
 */
export interface FactRecord<TAttributes extends FactAttributes = FactAttributes>
  extends Fact<TAttributes> {
  /**
   * Identifier assigned by the working memory.
   */
  readonly id: FactId;
}
