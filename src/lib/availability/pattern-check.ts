/* A pure check (no server code) - also used by tour-validate. */

/** Patterns that are known to backtrack without end ((a+)+, (a*)*, (a|a)*…) - refused when a pattern is saved. */
export function riskyPattern(pattern: string): boolean {
  return /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/.test(pattern) || pattern.length > 2000;
}
