/**
 * Browser Quick Start (ERC-6963)
 *
 * This example is meant for bundlers (Vite/Next/etc).
 * It discovers injected wallets via ERC-6963 and initializes the SDK using:
 * - rpcUrl for reads
 * - walletProvider for writes
 */

import { SDK } from '../src/index.js';
import { discoverEip6963Providers, connectEip1193 } from '../src/browser/eip6963.js';

async function main() {
  const providers = await discoverEip6963Providers({ timeoutMs: 300 });
  if (providers.length === 0) {
    throw new Error('No injected wallets found (ERC-6963). Install a wallet like MetaMask or Rabby.');
  }

  // Pick the first provider; in a real app, present a picker UI.
  const selected = providers[0];
  await connectEip1193(selected.provider, { requestAccounts: true });

  const sdk = new SDK({
    chainId: 11155111,
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
    walletProvider: selected.provider,
  });

  // Example write: create agent + register via HTTP (no IPFS required)
  const agent = sdk.createAgent('Browser Agent', 'Created from a browser wallet');
  const reg = await agent.registerHTTP('https://example.com/agents/browser-agent.json');
  console.log('Registered agent:', reg.agentId);
}

main().catch(console.error);

