# snug

[![npm](https://img.shields.io/npm/v/@jeremysnr/snug)](https://www.npmjs.com/package/@jeremysnr/snug)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@jeremysnr/snug)](https://bundlephobia.com/package/@jeremysnr/snug)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/@jeremysnr/snug?activeTab=dependencies)
[![license](https://img.shields.io/npm/l/@jeremysnr/snug)](./LICENSE)

**Fit prioritised content into a token budget.**

Every LLM application has the same problem: you have a context window of N tokens and need to fit a system prompt, conversation history, retrieved documents, and tool definitions into it — with space left for the model's reply. Every team writes their own solution from scratch.

`snug` is a single function that solves this once.

```ts
import { fit } from '@jeremysnr/snug';

const { included } = fit(
  [
    { id: 'system',  content: systemPrompt,  priority: 100 },
    { id: 'history', content: chatHistory,   priority:  60 },
    { id: 'rag',     content: retrievedDocs, priority:  40 },
  ],
  { budget: 8192, reserve: 1024, tokenizer: myTokenizer },
);

// included — items that fit, in original input order
// excluded — items that didn't fit
```

Items are selected greedily in descending priority order. The result preserves original input order. Zero dependencies. Works in Node, Deno, Bun, and edge runtimes.

## Install

```
npm install @jeremysnr/snug
```

## API

### `fit(items, options)`

```ts
fit(items: Item[], options: FitOptions): FitResult
```

**Item**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier |
| `content` | `unknown` | Your content — not inspected by snug |
| `priority` | `number` | Higher = included first |
| `tokens` | `number` | Pre-counted cost (optional — see below) |
| `pairId` | `string` | Atomic pair group (optional — see below) |

**FitOptions**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `budget` | `number` | — | Token limit for included items |
| `tokenizer` | `(text: string) => number` | built-in approx | Your token counter |
| `reserve` | `number` | `0` | Tokens to hold back (e.g. for model response) |
| `suppressApproximationWarning` | `boolean` | `false` | Silence the no-tokenizer warning |

**FitResult**

```ts
{
  included: Item[];     // items that fit, original order
  excluded: Item[];     // items that didn't fit
  tokensUsed: number;
  tokensRemaining: number;
}
```

## Pair constraints

Anthropic's API requires strict 1:1 pairing between `tool_use` and `tool_result` messages — orphaning either half causes a 400 error. Mark paired items with a shared `pairId` and snug treats them as an atomic unit: both are included or neither is.

```ts
fit(
  [
    { id: 'use',    content: toolUse,    priority: 80, pairId: 'call-1' },
    { id: 'result', content: toolResult, priority: 80, pairId: 'call-1' },
  ],
  { budget: 2048, tokenizer },
);
```

All items in a pair group must share the same `priority`.

## Token counting

Pass any `(text: string) => number` function:

```ts
// tiktoken (OpenAI / Anthropic)
import { encoding_for_model } from 'tiktoken';
const enc = encoding_for_model('gpt-4o');
const tokenizer = (text: string) => enc.encode(text).length;
```

If you already have a token count (e.g. from an API usage response), pass it directly via the `tokens` field and skip counting entirely:

```ts
{ id: 'msg', content: msg, priority: 50, tokens: 342 }
```

When no tokenizer is supplied, snug falls back to `Math.ceil(text.length / 4)` and prints a warning. This is useful for prototyping but can be off by up to 37% in production.

## Ecosystem

| Package | What it does |
|---------|-------------|
| `@jeremysnr/snug` | Zero-dependency core — bring your own tokenizer |
| [`@jeremysnr/snug-tiktoken`](https://github.com/JeremySNR/snug-tiktoken) | Pre-wired with tiktoken, model-agnostic |
| [`@jeremysnr/snug-openai`](https://github.com/JeremySNR/snug-openai) | Accepts OpenAI SDK message arrays directly |
| [`@jeremysnr/snug-anthropic`](https://github.com/JeremySNR/snug-anthropic) | Accepts Anthropic SDK message arrays, auto-pairs tool messages |

## Licence

MIT
