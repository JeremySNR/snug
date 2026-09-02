import { fit, approximateTokens } from '../src/index.js';
import type { Item } from '../src/index.js';

const t = (text: string): number => text.length; // 1 char = 1 token

const item = (id: string, content: string, priority: number, pairId?: string): Item =>
  ({ id, content, priority, pairId });

const itemT = (id: string, content: string, priority: number, tokens: number, pairId?: string): Item =>
  ({ id, content, priority, tokens, pairId });

describe('fit', () => {
  test('includes everything when it fits', () => {
    const result = fit([item('a', 'hello', 10), item('b', 'world', 5)], {
      budget: 20,
      tokenizer: t,
    });
    expect(result.included.map(i => i.id)).toEqual(['a', 'b']);
    expect(result.tokensUsed).toBe(10);
  });

  test('drops lowest priority when budget is tight', () => {
    const result = fit(
      [item('low', 'aaaaaaaaaa', 1), item('high', 'bbbbb', 100)],
      { budget: 7, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['high']);
    expect(result.excluded.map(i => i.id)).toEqual(['low']);
  });

  test('output order matches input order', () => {
    const result = fit(
      [item('c', 'ccc', 30), item('a', 'aaa', 50), item('b', 'bbb', 40)],
      { budget: 20, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['c', 'a', 'b']);
  });

  test('returns nothing when nothing fits', () => {
    const result = fit([item('big', 'a'.repeat(100), 99)], { budget: 10, tokenizer: t });
    expect(result.included).toHaveLength(0);
    expect(result.excluded.map(i => i.id)).toEqual(['big']);
  });

  test('tokensUsed and tokensRemaining are correct', () => {
    const result = fit([item('a', 'aaaaa', 10)], { budget: 20, reserve: 5, tokenizer: t });
    expect(result.tokensUsed).toBe(5);
    expect(result.tokensRemaining).toBe(10);
  });

  test('reserve reduces effective budget', () => {
    const result = fit(
      [item('big', 'a'.repeat(10), 10), item('small', 'bb', 5)],
      { budget: 12, reserve: 4, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['small']);
  });

  test('uses pre-supplied tokens field', () => {
    const result = fit(
      [itemT('a', 'ignored', 10, 50), itemT('b', 'ignored', 5, 3)],
      { budget: 10, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['b']);
  });

  test('tie-breaks by position', () => {
    const result = fit(
      [item('first', 'aaa', 50), item('second', 'bbb', 50), item('third', 'ccc', 50)],
      { budget: 6, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['first', 'second']);
    expect(result.excluded.map(i => i.id)).toEqual(['third']);
  });
});

describe('pair constraints', () => {
  test('excludes both halves when pair does not fit', () => {
    const result = fit(
      [
        item('use', 'use tool', 80, 'p1'),
        item('result', 'tool result', 80, 'p1'),
        item('other', 'short', 50),
      ],
      { budget: 15, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['other']);
    expect(result.excluded.map(i => i.id)).toContain('use');
    expect(result.excluded.map(i => i.id)).toContain('result');
  });

  test('includes both halves when pair fits', () => {
    const result = fit(
      [item('use', 'abc', 80, 'p1'), item('result', 'def', 80, 'p1')],
      { budget: 10, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['use', 'result']);
  });

  test('never orphans one half', () => {
    const result = fit(
      [
        item('use', 'a'.repeat(5), 90, 'p1'),
        item('result', 'b'.repeat(5), 90, 'p1'),
        item('filler', 'c'.repeat(8), 80),
      ],
      { budget: 12, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['use', 'result']);
    expect(result.excluded.map(i => i.id)).toEqual(['filler']);
  });

  test('pair token cost is the combined total', () => {
    const result = fit(
      [itemT('use', '', 90, 6, 'p1'), itemT('result', '', 90, 6, 'p1'), itemT('other', '', 50, 10)],
      { budget: 11, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['other']);
  });

  test('multiple pairs coexist', () => {
    const result = fit(
      [
        item('a1', 'aa', 90, 'pa'), item('a2', 'aa', 90, 'pa'),
        item('b1', 'bb', 70, 'pb'), item('b2', 'bb', 70, 'pb'),
        item('lone', 'c', 50),
      ],
      { budget: 9, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['a1', 'a2', 'b1', 'b2', 'lone']);
  });
});

describe('validation', () => {
  test('throws on Infinity priority', () => {
    expect(() => fit([item('x', 'hi', Infinity)], { budget: 100, tokenizer: t }))
      .toThrow(/non-finite priority/);
  });

  test('throws on mismatched pair priorities', () => {
    expect(() =>
      fit([item('a', 'hi', 90, 'p1'), item('b', 'hi', 50, 'p1')], { budget: 100, tokenizer: t }),
    ).toThrow(/same priority/);
  });

  test('throws on zero budget', () => {
    expect(() => fit([], { budget: 0, tokenizer: t })).toThrow(/positive finite/);
  });

  test('throws when reserve equals budget', () => {
    expect(() => fit([], { budget: 100, reserve: 100, tokenizer: t })).toThrow(/less than budget/);
  });

  test('throws when reserve exceeds budget', () => {
    expect(() => fit([], { budget: 50, reserve: 100, tokenizer: t })).toThrow(/less than budget/);
  });

  test('throws when content is not a string and tokens is missing', () => {
    const items: Item[] = [{ id: 'x', content: { nested: true }, priority: 10 }];
    expect(() => fit(items, { budget: 100, tokenizer: t })).toThrow(/no `tokens` field/);
  });

  test('throws on duplicate item ids', () => {
    expect(() =>
      fit([itemT('x', '', 10, 5), itemT('x', '', 10, 9)], { budget: 6, tokenizer: t }),
    ).toThrow('[snug] Duplicate item id "x"');
  });

  test('throws on a negative tokens field', () => {
    expect(() => fit([itemT('neg', '', 10, -50)], { budget: 100, tokenizer: t }))
      .toThrow(/Item "neg" has an invalid `tokens` value: -50/);
  });

  test('throws on a NaN tokens field', () => {
    expect(() => fit([itemT('nan', '', 10, NaN)], { budget: 100, tokenizer: t }))
      .toThrow(/Item "nan" has an invalid `tokens` value: NaN/);
  });

  test('throws on an Infinity tokens field', () => {
    expect(() => fit([itemT('inf', '', 10, Infinity)], { budget: 100, tokenizer: t }))
      .toThrow(/invalid `tokens` value: Infinity/);
  });

  test('throws when the tokenizer returns NaN', () => {
    expect(() => fit([item('a', 'hi', 10)], { budget: 100, tokenizer: () => NaN }))
      .toThrow(/Item "a" received an invalid token count from the tokenizer: NaN/);
  });

  test('throws when the tokenizer returns a negative number', () => {
    expect(() => fit([item('a', 'hi', 10)], { budget: 100, tokenizer: () => -1 }))
      .toThrow(/invalid token count from the tokenizer: -1/);
  });

  test('throws when the tokenizer returns a non-number', () => {
    const bad = (() => '3') as unknown as (text: string) => number;
    expect(() => fit([item('a', 'hi', 10)], { budget: 100, tokenizer: bad }))
      .toThrow(/invalid token count from the tokenizer: 3/);
  });

  test('accepts a zero token count', () => {
    const result = fit([itemT('empty', '', 10, 0)], { budget: 5, tokenizer: t });
    expect(result.included.map(i => i.id)).toEqual(['empty']);
    expect(result.tokensUsed).toBe(0);
  });
});

describe('required items', () => {
  const req = (id: string, content: string, priority: number, pairId?: string): Item =>
    ({ id, content, priority, pairId, required: true });

  test('required item is included when it fits', () => {
    const result = fit([req('sys', 'aaaaa', 100), item('opt', 'bbb', 10)], {
      budget: 20,
      tokenizer: t,
    });
    expect(result.included.map(i => i.id)).toEqual(['sys', 'opt']);
  });

  test('throws when a required item does not fit', () => {
    expect(() => fit([req('sys', 'a'.repeat(12), 100)], { budget: 10, tokenizer: t }))
      .toThrow('[snug] Required item "sys" does not fit');
  });

  test('error names the item and the token shortfall', () => {
    expect(() => fit([req('sys', 'a'.repeat(12), 100)], { budget: 10, tokenizer: t }))
      .toThrow(/needs 12 tokens but only 10 remain.*short by 2/);
  });

  test('shortfall accounts for higher-priority items already placed', () => {
    expect(() =>
      fit([item('high', 'a'.repeat(6), 100), req('must', 'b'.repeat(6), 50)], {
        budget: 10,
        tokenizer: t,
      }),
    ).toThrow(/needs 6 tokens but only 4 remain.*short by 2/);
  });

  test('required items are still placed by priority', () => {
    // 'high' is not required but outranks 'must'; it is placed first and
    // consumes the budget, so 'must' cannot fit and fit() throws rather than
    // silently promoting the required item.
    expect(() =>
      fit([item('high', 'a'.repeat(8), 100), req('must', 'b'.repeat(5), 50)], {
        budget: 10,
        tokenizer: t,
      }),
    ).toThrow(/Required item "must"/);

    // When there is room after the higher-priority item, both are included.
    const result = fit([item('high', 'a'.repeat(5), 100), req('must', 'b'.repeat(5), 50)], {
      budget: 10,
      tokenizer: t,
    });
    expect(result.included.map(i => i.id)).toEqual(['high', 'must']);
  });

  test('optional items are still excluded normally alongside required ones', () => {
    const result = fit(
      [req('sys', 'aaaaa', 100), item('big', 'b'.repeat(50), 60), item('small', 'cc', 40)],
      { budget: 10, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['sys', 'small']);
    expect(result.excluded.map(i => i.id)).toEqual(['big']);
  });

  test('required pair group throws when the pair does not fit', () => {
    expect(() =>
      fit([req('use', 'a'.repeat(6), 80, 'p1'), req('result', 'b'.repeat(6), 80, 'p1')], {
        budget: 10,
        tokenizer: t,
      }),
    ).toThrow(/Required item "use" \(pair group "p1"\) does not fit: it needs 12 tokens/);
  });

  test('required pair group is included when it fits', () => {
    const result = fit(
      [req('use', 'abc', 80, 'p1'), req('result', 'def', 80, 'p1')],
      { budget: 10, tokenizer: t },
    );
    expect(result.included.map(i => i.id)).toEqual(['use', 'result']);
  });

  test('throws when items in a pair group disagree on required', () => {
    expect(() =>
      fit([req('use', 'abc', 80, 'p1'), item('result', 'def', 80, 'p1')], {
        budget: 100,
        tokenizer: t,
      }),
    ).toThrow(/pair group "p1" must agree on `required`/);
  });

  test('required: false is treated the same as omitted in a pair group', () => {
    const items: Item[] = [
      { id: 'use', content: 'abc', priority: 80, pairId: 'p1', required: false },
      { id: 'result', content: 'def', priority: 80, pairId: 'p1' },
    ];
    expect(() => fit(items, { budget: 100, tokenizer: t })).not.toThrow();
  });
});

describe('no tokenizer', () => {
  test('warns when using approximation', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fit([item('a', 'hello', 10)], { budget: 100 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('approximation'));
    warn.mockRestore();
  });

  test('warning can be suppressed', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fit([item('a', 'hello', 10)], { budget: 100, suppressApproximationWarning: true });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('approximateTokens', () => {
  test('rounds up', () => expect(approximateTokens('hello')).toBe(2));
  test('empty string', () => expect(approximateTokens('')).toBe(0));
  test('exact multiple', () => expect(approximateTokens('abcd')).toBe(1));
});
