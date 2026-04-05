export type Tokenizer = (text: string) => number;

export interface Item {
  id: string;
  content: unknown;
  tokens?: number;
  priority: number;
  /** Items sharing a pairId are included or excluded as a unit. */
  pairId?: string;
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

// ~4 chars/token. Not accurate — fallback only.
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function resolveTokens(item: Item, tokenizer: Tokenizer): number {
  if (item.tokens !== undefined) return item.tokens;
  if (typeof item.content === 'string') return tokenizer(item.content);
  throw new Error(
    `[snug] Item "${item.id}" has no \`tokens\` field and its \`content\` is not a string.`,
  );
}

function validateItems(items: Item[]): void {
  const pairPriority = new Map<string, number>();
  for (const item of items) {
    if (!Number.isFinite(item.priority)) {
      throw new Error(`[snug] Item "${item.id}" has a non-finite priority: ${item.priority}`);
    }
    if (item.pairId !== undefined) {
      const existing = pairPriority.get(item.pairId);
      if (existing === undefined) {
        pairPriority.set(item.pairId, item.priority);
      } else if (existing !== item.priority) {
        throw new Error(
          `[snug] All items in pair group "${item.pairId}" must have the same priority. ` +
            `Found ${existing} and ${item.priority}.`,
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

  interface Group { items: T[]; totalTokens: number; priority: number; firstIndex: number }
  const groupMap = new Map<string, Group>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = item.pairId ?? item.id;
    if (!groupMap.has(key)) {
      groupMap.set(key, { items: [], totalTokens: 0, priority: item.priority, firstIndex: i });
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
    }
  }

  const included: T[] = [];
  const excluded: T[] = [];
  for (const item of items) {
    (includedIds.has(item.id) ? included : excluded).push(item);
  }

  return { included, excluded, tokensUsed, tokensRemaining: effectiveBudget - tokensUsed };
}
