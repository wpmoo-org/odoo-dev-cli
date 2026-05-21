import type { ListedModule } from './module-actions.js';

export type ModuleTarget = ListedModule;

export type ModuleTargetResolution =
  | { kind: 'exact'; query: string; module: ModuleTarget }
  | { kind: 'ambiguous'; query: string; candidates: ModuleTarget[] }
  | { kind: 'no-match'; query: string; candidates: ModuleTarget[] };

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function moduleMatchesExact(query: string, module: ModuleTarget): boolean {
  return module.moduleName.toLowerCase() === query;
}

function moduleMatchesPartial(query: string, module: ModuleTarget): boolean {
  return module.moduleName.toLowerCase().includes(query);
}

function tokenizeModuleName(moduleName: string): string[] {
  return moduleName.toLowerCase().split(/[_-]+/g).filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a) {
    return b.length;
  }
  if (!b) {
    return a.length;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, (_, rowIndex) => {
    const row = new Array<number>(cols);
    if (rowIndex === 0) {
      for (let col = 0; col < cols; col += 1) {
        row[col] = col;
      }
    } else {
      row[0] = rowIndex;
    }

    return row;
  });

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      const substitutions = matrix[row - 1][col - 1] + cost;
      const insertions = matrix[row][col - 1] + 1;
      const deletions = matrix[row - 1][col] + 1;
      matrix[row][col] = Math.min(substitutions, insertions, deletions);
    }
  }

  return matrix[a.length][b.length];
}

function nearestCandidates(
  query: string,
  modules: ModuleTarget[],
  maxItems = 3,
): ModuleTarget[] {
  const queryNormalized = query;
  const scoredModules = modules
    .map((module) => {
      const fullMatchDistance = levenshteinDistance(module.moduleName.toLowerCase(), queryNormalized);
      const tokenMatchDistance = tokenizeModuleName(module.moduleName).reduce<number>(
        (best, token) => Math.min(best, levenshteinDistance(token, queryNormalized)),
        Number.POSITIVE_INFINITY,
      );
      const distance = Math.min(fullMatchDistance, tokenMatchDistance);

      return { module, distance };
    })
    .filter((entry) => entry.distance <= 4);

  const scoredWithIndex = scoredModules.map((entry, index) => ({ ...entry, index }));
  scoredWithIndex.sort((left, right) => {
    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }

    return left.index - right.index;
  });

  const topDistance = scoredWithIndex[0]?.distance ?? Number.POSITIVE_INFINITY;

  return scoredWithIndex
    .filter((entry) => entry.distance <= topDistance + 1)
    .slice(0, maxItems)
    .map((entry) => entry.module);
}

export function resolveModuleTarget(query: string, modules: ModuleTarget[]): ModuleTargetResolution {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return { kind: 'no-match', query, candidates: [] };
  }

  const exactMatches = modules.filter((module) => moduleMatchesExact(normalizedQuery, module));
  if (exactMatches.length === 1) {
    return { kind: 'exact', query, module: exactMatches[0] };
  }
  if (exactMatches.length > 1) {
    return { kind: 'ambiguous', query, candidates: exactMatches };
  }

  const partialMatches =
    normalizedQuery.length >= 3 ? modules.filter((module) => moduleMatchesPartial(normalizedQuery, module)) : [];
  if (partialMatches.length === 1) {
    return { kind: 'exact', query, module: partialMatches[0] };
  }
  if (partialMatches.length > 1) {
    return { kind: 'ambiguous', query, candidates: partialMatches };
  }

  return { kind: 'no-match', query, candidates: nearestCandidates(normalizedQuery, modules) };
}
