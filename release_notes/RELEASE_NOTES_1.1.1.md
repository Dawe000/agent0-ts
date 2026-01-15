# Agent0 SDK v1.1.1 Release Notes

This release is a **bugfix** for browser signing with viem.

## Fixes

- **Fix: browser wallet `writeContract` now works reliably**
  - `ViemChainClient` now passes a `chain` when creating the viem `walletClient` (and `publicClient`).
  - This prevents errors where viem requires a chain context when using an EIP-1193 wallet provider transport.


