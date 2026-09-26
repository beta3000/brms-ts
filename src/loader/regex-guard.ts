/**
 * Static guard for `matches` patterns in loaded rule documents.
 *
 * Rule documents are untrusted input. A crafted regular expression evaluated
 * against every matching fact could stall the engine through catastrophic
 * backtracking, so the guard rejects the obviously dangerous patterns before
 * they are ever compiled: empty or oversized sources, sources that do not
 * compile, and sources containing a quantified group whose body itself
 * contains a counted quantifier (star height of two or more).
 *
 * The check is a deliberately conservative heuristic, not a proof of linear
 * matching time: it may reject harmless patterns (for example `(a+b|c)+`) and
 * it does not detect ambiguity through alternation (for example `(a|aa)+`),
 * which must be reviewed like code when loading untrusted rule sets.
 *
 * @packageDocumentation
 */

/**
 * Maximum accepted pattern length, in characters.
 */
const MAX_PATTERN_LENGTH = 256;

/**
 * Matches a braced quantifier (`{n}`, `{n,}`, or `{n,m}`) anchored at the
 * current position.
 */
const BRACED_QUANTIFIER = /\{(\d+)(?:,(\d*))?\}/y;

/**
 * Validates a `matches` pattern from a rule document.
 *
 * @param pattern - Regular-expression source text.
 * @returns `undefined` when the pattern is acceptable, otherwise a
 *   human-readable reason.
 *
 * @public
 */
export function validateRegexPattern(pattern: string): string | undefined {
  if (pattern.length === 0) {
    return 'pattern must be a non-empty string';
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `pattern exceeds the ${String(MAX_PATTERN_LENGTH)}-character limit`;
  }
  try {
    new RegExp(pattern);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return `pattern is not a valid regular expression: ${reason}`;
  }
  if (hasNestedQuantifier(pattern)) {
    return 'pattern contains a quantified group with an inner quantifier (catastrophic backtracking risk)';
  }
  return undefined;
}

/**
 * A braced quantifier found in the pattern.
 */
interface BracedQuantifier {
  /**
   * Index just past the quantifier.
   */
  readonly end: number;
  /**
   * Whether the quantifier can force exponential re-matching: its upper bound
   * is absent or greater than one.
   */
  readonly counted: boolean;
}

/**
 * Detects a quantified group whose body contains a counted quantifier.
 *
 * Counted quantifiers are `*`, `+`, and `{...}` with an absent or greater-than
 * one upper bound. `?`, `{1}`, and `{n,1}` are not counted, so patterns such
 * as `(b?c)*` and `(a+){1}` are accepted.
 *
 * @param pattern - Regular-expression source text.
 * @returns `true` when the pattern contains a quantified group with an inner
 *   counted quantifier.
 */
function hasNestedQuantifier(pattern: string): boolean {
  const openGroups: number[] = [];
  let inCharacterClass = false;
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (inCharacterClass) {
      if (char === ']') {
        inCharacterClass = false;
      }
      index += 1;
      continue;
    }
    if (char === '[') {
      inCharacterClass = true;
      index += 1;
      continue;
    }
    if (char === '(') {
      openGroups.push(index);
      index += 1;
      continue;
    }
    if (char === ')') {
      const open = openGroups.pop();
      if (
        open !== undefined &&
        isCountedQuantifierAt(pattern, index + 1) &&
        bodyHasCountedQuantifier(pattern, open + 1, index)
      ) {
        return true;
      }
    }
    index += 1;
  }
  return false;
}

/**
 * Reports whether a counted quantifier starts at `index`.
 */
function isCountedQuantifierAt(pattern: string, index: number): boolean {
  const char = pattern[index];
  if (char === '*' || char === '+') {
    return true;
  }
  if (char === '{') {
    const braced = readBracedQuantifier(pattern, index);
    return braced?.counted ?? false;
  }
  return false;
}

/**
 * Reports whether the text between `start` (exclusive of the `(`) and `end`
 * (the index of the `)`) contains a counted quantifier outside character
 * classes.
 */
function bodyHasCountedQuantifier(pattern: string, start: number, end: number): boolean {
  let inCharacterClass = false;
  let index = start;
  while (index < end) {
    const char = pattern[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (inCharacterClass) {
      if (char === ']') {
        inCharacterClass = false;
      }
      index += 1;
      continue;
    }
    if (char === '[') {
      inCharacterClass = true;
      index += 1;
      continue;
    }
    if (char === '*' || char === '+') {
      return true;
    }
    if (char === '{') {
      const braced = readBracedQuantifier(pattern, index);
      if (braced !== undefined) {
        if (braced.counted) {
          return true;
        }
        index = braced.end;
        continue;
      }
    }
    index += 1;
  }
  return false;
}

/**
 * Reads a braced quantifier starting at `index`, if any.
 *
 * @param pattern - Regular-expression source text.
 * @param index - Index of a `{` character.
 * @returns The parsed quantifier, or `undefined` when the braces are not a
 *   quantifier (a literal `{`).
 */
function readBracedQuantifier(pattern: string, index: number): BracedQuantifier | undefined {
  BRACED_QUANTIFIER.lastIndex = index;
  const match = BRACED_QUANTIFIER.exec(pattern);
  if (match === null) {
    return undefined;
  }
  const upper = match[2];
  const counted = upper === undefined ? Number(match[1]) > 1 : upper === '' || Number(upper) > 1;
  return { end: index + match[0].length, counted };
}
