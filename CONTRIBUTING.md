# Contributing

## Setup

```bash
git clone https://github.com/howdoiusekeyboard/react-haptics.git
cd react-haptics
bun install
bun run build
bun run test
bun run type-check
```

## Making changes

1. Branch from `main` (e.g., `feat/custom-engines`, `fix/ios-timing`).
2. Write tests for new behavior. Update tests for changed behavior.
3. Keep PRs focused. One feature or fix per PR.
4. Don't bundle unrelated refactors with functional changes.

## Commit style

Use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` new feature or API addition
- `fix:` bug fix
- `test:` adding or updating tests
- `docs:` documentation changes
- `refactor:` code change that doesn't fix a bug or add a feature

## Testing notes

Tests run with Vitest + jsdom.

- `navigator.vibrate` is mocked in individual tests (not globally).
- `window.matchMedia` is stubbed in `src/__tests__/setup.ts` since jsdom doesn't implement it.
- Fake timers (`vi.useFakeTimers()`) are used for pattern scheduling tests.
- Engine tests mock DOM methods (`appendChild`, `removeChild`, `click`) directly.

```bash
bun run test          # run all tests
bun run test -- -t "pattern name"  # run matching tests
```

## PR requirements

Before opening a PR, all of these must pass:

- [ ] `bun run type-check` (no type errors)
- [ ] `bun run test` (all tests green)
- [ ] `bun run build` (clean production build)
