# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-02

### Added

- `required?: boolean` on `Item`. When a required item (or the pair group containing it) cannot be included, `fit()` throws `[snug] Required item "id" does not fit ...` naming the item and the token shortfall. Required items are still placed by priority.
- Validation that all items in a pair group agree on `required`.
- `examples/demo.ts`, a short runnable demo, and a `demo` script that runs it with `tsx`.
- `CHANGELOG.md` and a GitHub Actions CI workflow (test and build on Node 20).
- `homepage`, `bugs`, `sideEffects: false` and `engines.node >= 18` in `package.json`.

### Fixed

- Duplicate item ids are now rejected with `[snug] Duplicate item id "x"`. Previously costs and inclusion were keyed by id with no uniqueness check, so two items sharing an id could both be excluded even when one of them fitted.
- Token counts are validated. A `tokens` field or tokenizer result that is negative, `NaN`, `Infinity` or not a number now throws. Previously `tokens: -50` produced a negative `tokensUsed` and a `tokensRemaining` above the budget, and `tokens: NaN` silently never fitted.
- `examples/` is no longer gitignored, so the `demo` script works for anyone cloning the repository.

### Changed

- README: the token counting section no longer claims tiktoken counts Anthropic tokens. Anthropic has its own tokenizer and a `count_tokens` endpoint; pass a count from the API via the `tokens` field or accept an approximation.
- README documents `required` and every validation error.

## [0.1.1] - 2026-04-05

Initial release, published to npm as `@jeremysnr/snug`. The repository history begins at this version; 0.1.0 was an earlier publish of the same code with no separate record.

### Added

- `fit(items, options)`: greedy selection by descending priority within a token budget, preserving input order.
- `pairId` for atomic pair groups (for example `tool_use` and `tool_result`), with validation that a group shares one priority.
- `tokens` field for pre-counted costs, `reserve` option, and a character-based fallback tokenizer with a suppressible warning.
- Validation of `budget`, `reserve` and `priority`.

[Unreleased]: https://github.com/JeremySNR/snug/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/JeremySNR/snug/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/JeremySNR/snug/releases/tag/v0.1.1
