# Agent0 SDK v1.1.2 Release Notes

This release is a **bugfix** for IPFS registration + on-chain metadata updates.

## Fixes

- **Fix: on-chain metadata `bytes` encoding**
  - Registration metadata values are now hex-encoded (`0x...`) before being passed to viem contract calls.
  - Prevents viem encoding errors when passing `Uint8Array` to Solidity `bytes`.

- **Fix: more robust transaction confirmation on slow testnets**
  - Increased default transaction wait timeout to 45 seconds.
  - Added a single retry (with extended timeout) when the initial confirmation times out.


