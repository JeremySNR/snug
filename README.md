# snug

[![npm](https://img.shields.io/npm/v/@jeremysnr/snug)](https://www.npmjs.com/package/@jeremysnr/snug)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@jeremysnr/snug)](https://bundlephobia.com/package/@jeremysnr/snug)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://www.npmjs.com/package/@jeremysnr/snug?activeTab=dependencies)
[![license](https://img.shields.io/npm/l/@jeremysnr/snug)](./LICENSE)

**Fit prioritised content into a token budget.**

Every LLM application has the same problem: you have a context window of N tokens and need to fit a system prompt, conversation history, retrieved documents, and tool definitions into it, with space left for the model's reply. Every team writes their own solution from scratch.

`snug` is a single function that solves this once.

```ts
import { fit } from '@jeremysnr/snug';

const { included } = fit(
  [
    { id: 'system',  content: systemPrompt,  priority: 100, required: true },
    { id: 'history', content: chatHistory,   priority:  60 },
    { id: 'rag',     content: retrievedDocs, priority:  40 },
  ],
  { budget: 8192, reserve: 1024, tokenizer: myTokenizer },
);

// included: items that fit, in original input order
// excluded: items that didn't fit
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
| `id` | `string` | Unique identifier. Duplicates throw. |
| `content` | `unknown` | Your content, not inspected by snug |
| `priority` | `number` | Higher = included first |
| `tokens` | `number` | Pre-counted cost (optional, see below) |
| `pairId` | `string` | Atomic pair group (optional, see below) |
| `required` | `boolean` | Throw instead of excluding if it does not fit (optional, see below) |

**FitOptions**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `budget` | `number` | (required) | Token limit for included items |
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

Anthropic's API requires strict 1:1 pairing between `tool_use` and `tool_result` messages. Orphaning either half causes a 400 error. Mark paired items with a shared `pairId` and snug treats them as an atomic unit: both are included or neither is.

```ts
fit(
  [
    { id: 'use',    content: toolUse,    priority: 80, pairId: 'call-1' },
    { id: 'result', content: toolResult, priority: 80, pairId: 'call-1' },
  ],
  { budget: 2048, tokenizer },
);
```

All items in a pair group must share the same `priority` and the same `required` value.

## Required items

Some content must always be sent: a system prompt, the user's latest message, a tool result the model is waiting on. Mark it `required: true` and snug throws if it cannot be included, rather than silently dropping it and letting the request go out incomplete.

```ts
fit(
  [
    { id: 'system', content: systemPrompt, priority: 100, required: true },
    { id: 'latest', content: latestTurn,   priority:  90, required: true },
    { id: 'rag',    content: docs,         priority:  40 },
  ],
  { budget: 4096, reserve: 512, tokenizer },
);
// Error: [snug] Required item "latest" does not fit: it needs 700 tokens but only
// 120 remain after higher-priority items (short by 580). Budget 4096, reserve 512.
```

Required items are still placed by priority. The flag does not promote an item above higher-priority optional items; it only changes what happens when the item does not fit. Give required items the highest priorities if they must be placed before optional content.

If any item in a pair group is required, all items in that group must be required, and the error names the group.

## Validation errors

`fit()` throws an `Error` whose message starts with `[snug]` when the input cannot be trusted. Catch these during development; they indicate a bug in the calling code rather than a tight budget.

| Condition | Message |
|-----------|---------|
| Two items share an `id` | `Duplicate item id "x". Item ids must be unique.` |
| `tokens` is negative, `NaN`, `Infinity`, or not a number | `Item "x" has an invalid \`tokens\` value: -50. Token counts must be finite numbers >= 0.` |
| The tokenizer returns a negative, `NaN`, `Infinity`, or non-number value | `Item "x" received an invalid token count from the tokenizer: NaN. ...` |
| `priority` is not finite | `Item "x" has a non-finite priority: Infinity` |
| Items in a pair group have different priorities | `All items in pair group "p" must have the same priority. Found 90 and 50.` |
| Items in a pair group disagree on `required` | `All items in pair group "p" must agree on \`required\`. Found true and false.` |
| A required item or pair group does not fit | `Required item "x" does not fit: it needs N tokens but only M remain after higher-priority items (short by S). Budget B, reserve R.` |
| `content` is not a string and `tokens` is missing | `Item "x" has no \`tokens\` field and its \`content\` is not a string.` |
| `budget` is not a positive finite number | `budget must be a positive finite number. Got: 0` |
| `reserve` is negative or not less than `budget` | `reserve (100) must be less than budget (100).` |

## Token counting

Pass any `(text: string) => number` function.

**OpenAI models** use tiktoken. Pass the model name so tiktoken picks the right encoding (`gpt-4o` and newer use `o200k_base`; `gpt-4` and `gpt-3.5-turbo` use `cl100k_base`):

```ts
import { encoding_for_model } from 'tiktoken';
const enc = encoding_for_model('gpt-4o');
const tokenizer = (text: string) => enc.encode(text).length;
```

**Anthropic models** do not use tiktoken. Claude has its own tokenizer, which Anthropic does not publish as a library, and a tiktoken count will be off by a variable margin. For an exact count call the [count_tokens endpoint](https://docs.anthropic.com/en/api/messages-count-tokens) (`client.messages.countTokens(...)` in the SDK) and pass the result through the `tokens` field so snug never needs to count:

```ts
const { input_tokens } = await client.messages.countTokens({ model, messages: [msg] });
{ id: 'msg', content: msg, priority: 50, tokens: input_tokens }
```

If a network round trip per item is too expensive, use a tiktoken or character-based count as an approximation and keep a healthy `reserve` to absorb the error.

If you already have a token count from any source (for example an API usage response), pass it via the `tokens` field and skip counting entirely:

```ts
{ id: 'msg', content: msg, priority: 50, tokens: 342 }
```

When no tokenizer is supplied, snug falls back to `Math.ceil(text.length / 4)` and prints a warning. This is useful for prototyping but can be off by up to 37% in production.

## Demo

```
npm install
npm run demo
```

Runs [`examples/demo.ts`](./examples/demo.ts) with `tsx`.

## Ecosystem

| Package | What it does |
|---------|-------------|
| `@jeremysnr/snug` | Zero-dependency core, bring your own tokenizer |
| [`@jeremysnr/snug-tiktoken`](https://github.com/JeremySNR/snug-tiktoken) | Pre-wired with tiktoken for OpenAI encodings |
| [`@jeremysnr/snug-openai`](https://github.com/JeremySNR/snug-openai) | Accepts OpenAI SDK message arrays directly |
| [`@jeremysnr/snug-anthropic`](https://github.com/JeremySNR/snug-anthropic) | Accepts Anthropic SDK message arrays, auto-pairs tool messages |

## Licence

MIT
