# E2E verification tests

These tests automate the "common verification procedure". They are **not** wired
into CI — they require a live dev server and an installed `playwright-cli`
binary on the developer's machine.

## Stack

- Node's built-in test runner (`node:test`) and assertion module
  (`node:assert/strict`) — no devDependencies are added to the project.
- Browser automation via [`playwright-cli`](https://npmjs.com/package/@playwright/cli)
  shelled out from `node:child_process.spawnSync`.

## Prerequisites

1. **`playwright-cli` installed and on `PATH`**:
   ```bash
   playwright-cli --version
   # If absent:
   npm install -g @playwright/cli@latest
   ```
2. **Dev server running** at `http://localhost:5173/` (the default Vite port):
   ```bash
   npm run dev
   ```
   To target a different URL, set `E2E_URL=...` when invoking the tests.

## Running

In a separate shell from the dev server:

```bash
npm run test:e2e
# equivalent to: node --test e2e/verification.test.mjs
```

Optional flags:

- `E2E_URL=http://localhost:4173/` — override the target URL (e.g. when
  testing the preview build).
- `E2E_PASTE=1` — enables the synthetic-paste scenario (skipped by default;
  the `ClipboardEvent` dispatch can be flaky under some browser versions).

The suite opens one persistent `playwright-cli` session named
`etude-verify`, runs every scenario against it, then closes it. Mixing the
default session (`playwright-cli open …` without `-s=...`) and `etude-verify`
is safe.

## What's covered

| Group | Scenarios |
|---|---|
| Creation | Open fence with / without language |
| Content input | Plain insertion; Prism highlighting on blur |
| Backspace at block start | No prev sibling / empty prev / non-empty prev (dissolve) |
| Backspace at first content line start | Merge first line into open fence |
| Backspace at close fence line start | Prev = content / empty line / open fence |
| Exit keys | `Escape`, `ArrowDown` from last line |
| Blur validation | Canonical preserved; broken fence unwrapped |
| `Always show fences` toggle | Wrapper class flip |
| HTML `<pre>` paste | Skipped unless `E2E_PASTE=1` |

## Updating

When the rich editor's DOM structure changes (e.g. class names move, the
markdown source panel relocates), update
[`helpers.mjs`](helpers.mjs) — the selectors and per-scenario helpers all
live there. The scenario file
[`verification.test.mjs`](verification.test.mjs) is written in terms of
those helpers so individual tests rarely need to change.
