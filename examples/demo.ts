/**
 * Runnable demo for snug. Run with `npm run demo` (uses tsx).
 *
 * Uses a deliberately crude tokenizer (one token per word) so the numbers are
 * easy to follow. In real code, pass a tiktoken encoder or a count from your
 * provider's API via the `tokens` field.
 */
import { fit } from '../src/index.js';
import type { Item } from '../src/index.js';

const wordTokenizer = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const items: Item[] = [
  {
    id: 'system',
    content: 'You are a concise travel assistant. Answer in British English.',
    priority: 100,
    required: true,
  },
  {
    id: 'latest-user',
    content: 'Which of the three hotels you mentioned has the best pool?',
    priority: 90,
    required: true,
  },
  {
    id: 'tool-use',
    content: 'search_hotels({ city: "Lisbon", stars: 4 })',
    priority: 70,
    pairId: 'call-1',
  },
  {
    id: 'tool-result',
    content: 'Found: Hotel Avenida (pool, rooftop), Casa do Bairro (no pool), Tejo Suites (indoor pool).',
    priority: 70,
    pairId: 'call-1',
  },
  {
    id: 'old-history',
    content:
      'User: Hi, I am planning a long weekend in Lisbon in October with my partner. ' +
      'Assistant: Lovely choice. October is warm and quieter than the summer months.',
    priority: 40,
  },
  {
    id: 'rag-doc',
    content:
      'Lisbon guide: The city has seven hills, a historic tram network, and excellent seafood. ' +
      'Neighbourhoods include Alfama, Baixa, Chiado, Bairro Alto and Belem.',
    priority: 30,
  },
];

function show(label: string, budget: number, reserve: number): void {
  console.log(`\n== ${label}: budget ${budget}, reserve ${reserve}`);
  try {
    const result = fit(items, { budget, reserve, tokenizer: wordTokenizer });
    console.log(`  included : ${result.included.map(i => i.id).join(', ')}`);
    console.log(`  excluded : ${result.excluded.map(i => i.id).join(', ') || '(none)'}`);
    console.log(`  used ${result.tokensUsed}, remaining ${result.tokensRemaining}`);
  } catch (err) {
    console.log(`  threw: ${(err as Error).message}`);
  }
}

show('Everything fits', 200, 20);
show('Tight: low-priority items drop, tool pair stays together', 60, 10);
show('Very tight: the tool pair is dropped as a unit', 40, 5);
show('Too tight for a required item', 15, 5);
