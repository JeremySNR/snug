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
