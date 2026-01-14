# Release Notes — Agent0 TypeScript SDK v1.0.2

This release is a **major refactor** to align the TypeScript SDK with the **updated ERC-8004 (Jan 2026)** deployments and behavior.

> **Breaking changes**: this release intentionally removes backwards compatibility in several areas (feedback flow, agent URI naming, and agent wallet management).

---

## Highlights

- **ERC-8004 Jan 2026 compatibility**
  - Updated registry ABIs and Sepolia defaults to match the new deployments.
  - Updated subgraph query fields where schema changed.

- **Endpoint removal helpers (parity with Python)**
  - Added `Agent.removeEndpoint(...)` and `Agent.removeEndpoints()` to remove endpoints by type, value, or clear all with wildcard semantics.
  - This replaces the previous TypeScript docs workaround of manually filtering `registrationFile.endpoints`.

- **Search API ergonomics (removed positional `undefined`)**
  - `searchAgents(...)`, `searchAgentsByReputation(...)`, and `searchFeedback(...)` now take **`(filters, options?)`** objects instead of long positional argument lists.
  - This is a **breaking change** (no backwards compatibility).

- **Agent URI naming**
  - On-chain “token URI” naming is now **`agentURI`** across SDK logic and examples.

- **Agent wallet management (`setAgentWallet`)**
  - `Agent.setAgentWallet(...)` is now **on-chain only** and **signature-gated** (EIP-712 + ERC-1271 compatible), aligned with the Python SDK UX.
  - Calling it on an unregistered agent now **throws**.

- **Feedback flow updated (ERC-8004 Jan 2026)**
  - Removed the deprecated `feedbackAuth` flow (permissionless feedback).
  - `endpoint` is now an **optional on-chain** field for feedback.
  - Feedback tags moved from `bytes32` to **`string`**.

---

## Breaking API changes

### Search APIs (public)

The TypeScript SDK search APIs were refactored to remove positional parameters (and the resulting `undefined, undefined, ...` call sites).

#### ✅ New (v1.0.2)

```ts
// Agent discovery search (filters + paging/sort)
const agents = await sdk.searchAgents(
  { active: true, mcp: true },
  { pageSize: 20, sort: ['updatedAt:desc'] }
);

// Reputation-based agent search (filters + paging/sort/chains)
const topRated = await sdk.searchAgentsByReputation(
  { tags: ['enterprise'], minAverageScore: 90 },
  { pageSize: 20, chains: [11155111], includeRevoked: false }
);

// Feedback search for a single agent (filters + score-range options)
const feedback = await sdk.searchFeedback(
  { agentId: '11155111:123', tags: ['data_analyst'], capabilities: ['tools'] },
  { minScore: 80, maxScore: 100 }
);
```

#### ❌ Removed (no compatibility)

- Positional signatures like:
  - `searchAgents(params?, sort?, pageSize?, cursor?)`
  - `searchAgentsByReputation(agents?, tags?, reviewers?, ... many more ...)`
  - `searchFeedback(agentId, tags?, capabilities?, skills?, minScore?, maxScore?)`

### Feedback API (public)

The feedback API has been simplified so the main `giveFeedback` call directly takes the **on-chain fields**.

#### ✅ New (v1.0.2)

```ts
await sdk.giveFeedback(
  agentId,
  score,
  tag1?,      // optional
  tag2?,      // optional
  endpoint?,  // optional, stored on-chain
  feedbackFile? // optional off-chain file content (Pinata/Filecoin/IPFS node)
);
```

#### ❌ Removed (no compatibility)

- `sdk.prepareFeedback(...)` (old “mixed” builder)
- Any `feedbackAuth` / `signFeedbackAuth` API

#### New helper

```ts
const feedbackFile = sdk.prepareFeedbackFile({
  text: 'optional',
  context: { sessionId: 'abc' },
  capability: 'tools',
  name: 'my_tool',
});
```

**Behavioral rules (important):**
- If `feedbackFile` is **not provided**, the SDK submits **on-chain only** feedback (no upload), even if IPFS/Pinata is configured.
- If `feedbackFile` **is provided** but no off-chain backend is configured (`pinata` / `filecoinPin` / `node`), the SDK **throws** (to avoid silently dropping rich fields).
- When reading feedback, the SDK prefers the **on-chain `endpoint`**; off-chain is used only as a **fallback**.

---

## Contract / spec alignment details

### Identity Registry
- `tokenURI` naming aligned to **`agentURI`**.
- Added/updated `setAgentWallet(...)` and `getAgentWallet(...)` support.

### Reputation Registry
- `feedbackAuth` removed from `giveFeedback(...)`.
- `endpoint` added to on-chain feedback.
- `tag1` / `tag2` now **strings** (not bytes32).
- Event + helper functions updated to match the new spec.

### Validation Registry
- Validation `tag` now **string**.

---

## Tests and examples

### Tests
- Test suite updated to be **strict** against the new deployments (no “tolerate/skip” logic).
- Feedback tests updated to use the **new `giveFeedback(...)` signature** and the new endpoint semantics.

### Examples
- Examples were updated to:
  - Accept `PRIVATE_KEY` **or** `AGENT_PRIVATE_KEY` for convenience.
  - Include an explicit **on-chain only feedback** example.
  - Make transfer and update examples **self-contained** (they register fresh agents before mutating/transferring).

> Note: IPFS gateway verification may warn with HTTP 429/timeouts when Pinata gateways rate-limit. Upload/tx submission still succeeds; the warning is about post-upload verification.

---

## Migration guide (from pre-Jan-2026 builds)

1. **Replace `prepareFeedback(...)`**
   - Use `prepareFeedbackFile(...)` only when you need rich/off-chain fields.
   - Pass on-chain fields directly to `giveFeedback(...)`.

2. **Remove feedbackAuth usage**
   - Delete `signFeedbackAuth` and any `feedbackAuth` parameters.

3. **Update `tokenURI` references**
   - Replace any usage with `agentURI`.

4. **Update `setAgentWallet` usage**
   - Ensure the agent is registered first.
   - Use the new signature-gated on-chain flow.

5. **Update TypeScript search calls**
   - Replace positional calls with object args:
     - `searchAgents(filters, options?)`
     - `searchAgentsByReputation(filters, options?)`
     - `searchFeedback(filters, options?)`
   - This eliminates long chains of `undefined` for optional parameters.

---

## Compatibility

- Designed for the **ERC-8004 Jan 2026** deployments (especially Sepolia defaults).
- This release is not intended to maintain compatibility with legacy deployments.

