# Release Notes — Agent0 TypeScript SDK v1.0.3

This release is focused on **installation reliability** for consumers of the published npm package.

---

## Highlights

- **Fix: `npm install agent0-sdk` no longer runs GraphQL codegen**
  - Removed the `postinstall` hook that previously executed `npm run codegen`.
  - This prevents consumer installs from failing with `graphql-codegen: command not found` (codegen is a devDependency and should not be required for consumers).

- **Publish safety: `dist/` is always built before packaging**
  - Added `prepack` hook to run `npm run build` before `npm pack` / `npm publish`.
  - `npm run build` still runs codegen as part of the maintainers’ build pipeline (`prebuild`).

---

## What changed (maintainers)

- `postinstall` removed (no install-time scripts for consumers).
- `prepack` added to guarantee the published tarball contains up-to-date build output.

---

## Compatibility

- Designed for the **ERC-8004 Jan 2026** deployments (especially Sepolia defaults), same as v1.0.2.


