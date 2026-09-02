export type Tokenizer = (text: string) => number;

export interface Item {
  id: string;
  content: unknown;
  tokens?: number;
  priority: number;
  /** Items sharing a pairId are included or excluded as a unit. */
  pairId?: string;
  /**
   * When true, fit() throws instead of excluding this item (or the pair group
   * containing it) if it cannot be included. Required items are still placed
   * by priority; the flag only changes what happens when they do not fit.
   */
  required?: boolean;
}

export interface FitOptions {
  budget: number;
  tokenizer?: Tokenizer;
  reserve?: number;
  suppressApproximationWarning?: boolean;
}

export interface FitResult<T extends Item = Item> {
  included: T[];
  excluded: T[];
  tokensUsed: number;
  tokensRemaining: number;
}

const APPROX_WARNING =
  '[snug] No tokenizer supplied. Using a character-based approximation ' +
  '(~4 chars/token). This can be off by up to 37% on large payloads. ' +
  'Pass a real tokenizer via options.tokenizer for production use.';

// ~4 chars/token. Not accurate. Fallback only.
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function assertTokenCount(item: Item, value: unknown, source: 'tokens' | 'tokenizer'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    const where = source === 'tokens'
      ? 'has an invalid `tokens` value'
      : 'received an invalid token count from the tokenizer';
    throw new Error(
      `[snug] Item "${item.id}" ${where}: ${String(value)}. ` +
        'Token counts must be finite numbers >= 0.',
    );
  }
  return value;
}

function resolveTokens(item: Item, tokenizer: Tokenizer): number {
  if (item.tokens !== undefined) return assertTokenCount(item, item.tokens, 'tokens');
  if (typeof item.content === 'string') {
    return assertTokenCount(item, tokenizer(item.content), 'tokenizer');
  }
  throw new Error(
    `[snug] Item "${item.id}" has no \`tokens\` field and its \`content\` is not a string.`,
  );
}

function validateItems(items: Item[]): void {
  const seenIds = new Set<string>();
  const pairPriority = new Map<string, number>();
  const pairRequired = new Map<string, boolean>();

  for (const item of items) {
    if (seenIds.has(item.id)) {
      throw new Error(`[snug] Duplicate item id "${item.id}". Item ids must be unique.`);
    }
    seenIds.add(item.id);

    if (!Number.isFinite(item.priority)) {
      throw new Error(`[snug] Item "${item.id}" has a non-finite priority: ${item.priority}`);
    }

    if (item.pairId !== undefined) {
      const existingPriority = pairPriority.get(item.pairId);
      if (existingPriority === undefined) {
        pairPriority.set(item.pairId, item.priority);
      } else if (existingPriority !== item.priority) {
        throw new Error(
          `[snug] All items in pair group "${item.pairId}" must have the same priority. ` +
            `Found ${existingPriority} and ${item.priority}.`,
        );
      }

      const required = item.required === true;
      const existingRequired = pairRequired.get(item.pairId);
      if (existingRequired === undefined) {
        pairRequired.set(item.pairId, required);
      } else if (existingRequired !== required) {
        throw new Error(
          `[snug] All items in pair group "${item.pairId}" must agree on \`required\`. ` +
            `Found ${existingRequired} and ${required}.`,
        );
      }
    }
  }
}

export function fit<T extends Item>(items: T[], options: FitOptions): FitResult<T> {
  const { budget, reserve = 0, suppressApproximationWarning = false } = options;

  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error(`[snug] budget must be a positive finite number. Got: ${budget}`);
  }
  if (!Number.isFinite(reserve) || reserve < 0) {
    throw new Error(`[snug] reserve must be a non-negative finite number. Got: ${reserve}`);
  }
  const effectiveBudget = budget - reserve;
  if (effectiveBudget <= 0) {
    throw new Error(`[snug] reserve (${reserve}) must be less than budget (${budget}).`);
  }

  const tokenizer = options.tokenizer ?? (() => {
    if (!suppressApproximationWarning) console.warn(APPROX_WARNING);
    return approximateTokens;
  })();

  validateItems(items);

  const costs = new Map<string, number>(
    items.map(item => [item.id, resolveTokens(item, tokenizer)]),
  );

  interface Group {
    items: T[];
    totalTokens: number;
    priority: number;
    firstIndex: number;
    required: boolean;
  }
  const groupMap = new Map<string, Group>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = item.pairId ?? item.id;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        items: [],
        totalTokens: 0,
        priority: item.priority,
        firstIndex: i,
        required: item.required === true,
      });
    }
    const g = groupMap.get(key)!;
    g.items.push(item);
    g.totalTokens += costs.get(item.id)!;
  }

  const groups = [...groupMap.values()].sort(
    (a, b) => b.priority - a.priority || a.firstIndex - b.firstIndex,
  );

  const includedIds = new Set<string>();
  let tokensUsed = 0;

  for (const g of groups) {
    if (tokensUsed + g.totalTokens <= effectiveBudget) {
      for (const item of g.items) includedIds.add(item.id);
      tokensUsed += g.totalTokens;
    } else if (g.required) {
      const remaining = effectiveBudget - tokensUsed;
      const shortfall = g.totalTokens - remaining;
      const first = g.items[0];
      const label = g.items.length > 1
        ? `Required item "${first.id}" (pair group "${first.pairId}")`
        : `Required item "${first.id}"`;
      throw new Error(
        `[snug] ${label} does not fit: it needs ${g.totalTokens} tokens but only ` +
          `${remaining} remain after higher-priority items (short by ${shortfall}). ` +
          `Budget ${budget}, reserve ${reserve}.`,
      );
    }
  }

  const included: T[] = [];
  const excluded: T[] = [];
  for (const item of items) {
    (includedIds.has(item.id) ? included : excluded).push(item);
  }

  return { included, excluded, tokensUsed, tokensRemaining: effectiveBudget - tokensUsed };
}
