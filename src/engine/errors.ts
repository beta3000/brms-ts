/**
 * Error types raised by the rule engine.
 *
 * @packageDocumentation
 */

/**
 * Base class for all errors raised by brms-ts.
 *
 * Allows consumers to catch any engine error with a single `instanceof` check.
 *
 * @public
 */
export class BrmsError extends Error {
  /**
   * Creates a new engine error.
   *
   * @param message - Human-readable description of the error.
   */
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Restore the prototype chain when targeting older runtimes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Raised when a rule references a predicate or function that has not been
 * registered in the engine.
 *
 * @public
 */
export class UnknownReferenceError extends BrmsError {
  /**
   * Creates a new unknown-reference error.
   *
   * @param kind - Whether the missing reference is a `predicate` or a
   *   `function`.
   * @param name - The name that could not be resolved.
   */
  public constructor(kind: 'predicate' | 'function', name: string) {
    super(`Unknown ${kind} "${name}". Register it before using it in a rule.`);
  }
}

/**
 * Raised when a rule or configuration is structurally invalid.
 *
 * @public
 */
export class ValidationError extends BrmsError {
  /**
   * Detailed list of validation problems.
   */
  public readonly details: readonly string[];

  /**
   * Creates a new validation error.
   *
   * @param message - Summary of the validation failure.
   * @param details - Individual validation problems.
   */
  public constructor(message: string, details: readonly string[] = []) {
    super(message);
    this.details = details;
  }
}

/**
 * Raised when the inference cycle exceeds the configured safety limit,
 * indicating a probable infinite loop.
 *
 * @public
 */
export class CycleLimitExceededError extends BrmsError {
  /**
   * Creates a new cycle-limit error.
   *
   * @param limit - The maximum number of cycles that was exceeded.
   */
  public constructor(limit: number) {
    super(
      `Inference cycle limit of ${String(limit)} exceeded. This usually indicates an infinite ` +
        `loop; review rule actions or set noLoop on self-modifying rules.`,
    );
  }
}
