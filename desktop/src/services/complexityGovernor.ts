import { AntiBloatCheckResult, FileDiff } from "../types";

// Common bloat packages that have zero-cost native JavaScript / Web standards alternatives
const UNNECESSARY_DEPENDENCY_PATTERNS: Record<string, string> = {
  "moment": "Use native `Intl.DateTimeFormat` or lightweight `date-fns/format` instead.",
  "lodash": "Use native Array methods (`map`, `filter`, `reduce`, `flatMap`) and `structuredClone`.",
  "underscore": "Use modern ES6+ native array and object methods.",
  "axios": "Use standard modern native `fetch()` which is available in Node 18+ and all modern browsers.",
  "uuid": "Use native `crypto.randomUUID()` available in all modern runtimes.",
  "left-pad": "Use native `String.prototype.padStart()`.",
  "is-promise": "Use `value instanceof Promise || typeof value?.then === 'function'`.",
  "deep-equal": "Use simple custom shallow/deep recursive function or compare key primitives.",
  "chalk": "Use standard ANSI escape sequences or modern logger formatting.",
  "querystring": "Use native `URLSearchParams` standard API.",
  "request": "Deprecated. Use native `fetch`.",
};

export function inspectDiffComplexity(
  diffsOrPath: FileDiff[] | string,
  oldContent?: string,
  newContent?: string
): AntiBloatCheckResult {
  const diffs: FileDiff[] = Array.isArray(diffsOrPath)
    ? diffsOrPath
    : [{ path: diffsOrPath, oldContent: oldContent || "", newContent: newContent || "", isNewFile: !oldContent }];

  const warnings: string[] = [];
  const suggestions: string[] = [];
  let bloatScore = 0;

  for (const diff of diffs) {
    const lines = diff.newContent.split("\n");
    const addedLines = lines.length;

    // 1. Check for unnecessary third-party package imports
    for (const [pkg, alternative] of Object.entries(UNNECESSARY_DEPENDENCY_PATTERNS)) {
      const importRegex = new RegExp(`(import\\s+.*from\\s+['"]${pkg}['"]|require\\(['"]${pkg}['"]\\))`, "i");
      if (importRegex.test(diff.newContent)) {
        warnings.push(`Detected redundant dependency '${pkg}' in ${diff.path}.`);
        suggestions.push(`Replace '${pkg}' with: ${alternative}`);
        bloatScore += 25;
      }
    }

    // 2. Check for deep nesting (over-engineering / spaghetti)
    let maxIndentation = 0;
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      const leadingSpaces = line.length - trimmed.length;
      maxIndentation = Math.max(maxIndentation, leadingSpaces);
    }

    if (maxIndentation >= 16) {
      warnings.push(`Excessive nesting (${Math.floor(maxIndentation / 2)} levels) in ${diff.path}.`);
      suggestions.push("Refactor deep conditionals using early returns / guard clauses.");
      bloatScore += 15;
    }

    // 3. Check for single-file bloat (> 350 lines in a single generated file)
    if (addedLines > 350 && !diff.path.endsWith(".json")) {
      warnings.push(`File ${diff.path} has ${addedLines} lines. High cognitive load.`);
      suggestions.push("Break down large component into focused, single-responsibility modules.");
      bloatScore += 10;
    }
  }

  const isViolating = bloatScore >= 25;
  return {
    passed: !isViolating,
    isViolating,
    suggestedRemedy: suggestions.join(" | ") || warnings.join(" | "),
    warnings,
    suggestions,
    bloatScore: Math.min(bloatScore, 100),
  };
}
