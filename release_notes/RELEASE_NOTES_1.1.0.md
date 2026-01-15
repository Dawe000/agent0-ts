# Agent0 SDK v1.1.0 Release Notes

This release updates the on-chain stack and enables first-class browser usage.

## Breaking changes

- Removed `ethers` integration:
  - `Web3Client` is removed.
  - `SDK.web3Client` is removed.
  - `SDK.getIdentityRegistry()` / `getReputationRegistry()` / `getValidationRegistry()` are removed (they returned `ethers.Contract`).

- Agent wallet API change:
  - `agent.setAgentWallet(..., { newWalletSigner })` is replaced by `agent.setAgentWallet(..., { newWalletPrivateKey })`
  - You can also pass `signature` directly if you already have it from an external signer.

## New features

- **Browser signing via ERC-6963**:
  - New subpath export: `agent0-sdk/eip6963`
  - Helpers: `discoverEip6963Providers()` and `connectEip1193()`

- **Viem-only chain layer**:
  - New `ChainClient` abstraction and `ViemChainClient` implementation.
  - Server-side signing works via `privateKey` (hex string).
  - Browser-side signing works via `walletProvider` (EIP-1193 provider).

## Configuration changes

- `SDKConfig.privateKey?: string` (recommended for server-side write access)
- `SDKConfig.walletProvider?: EIP1193Provider` (recommended for browser-side write access)
- `SDKConfig.signer?: string` is still accepted as a backwards-compatible alias for `privateKey`.

## Packaging

- Added `package.json#exports` entries for:
  - `agent0-sdk` (main)
  - `agent0-sdk/eip6963` (ERC-6963 helpers)

## Notes

Integration tests that require secrets (e.g. `AGENT_PRIVATE_KEY`, `PINATA_JWT`, `CLIENT_PRIVATE_KEY`) now skip cleanly if the env vars are not provided.

