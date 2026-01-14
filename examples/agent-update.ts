/**
 * Agent Update Example
 * 
 * This example demonstrates how to:
 * 1. Create and register a new agent (so the signer is the owner)
 * 2. Load that agent back from chain/IPFS
 * 3. Update agent information
 * 4. Update the registration file on-chain (re-register)
 */

import { SDK } from '../src/index';

async function main() {
  // Initialize SDK
  const sdk = new SDK({
    chainId: 11155111, // Ethereum Sepolia
    rpcUrl: process.env.RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
    signer: process.env.PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY, // Required for updates
    ipfs: 'pinata',
    pinataJwt: process.env.PINATA_JWT,
  });

  // 1) Create + register a fresh agent (self-contained)
  const agent = sdk.createAgent(
    'Update Example Agent',
    'An agent created by the update example script.',
    'https://example.com/agent-image.png'
  );
  await agent.setMCP('https://api.example.com/mcp', '2025-06-18');
  agent.setActive(true);

  console.log('Registering a new agent (setup for this example)...');
  const registration = await agent.registerIPFS();
  if (!registration.agentId) {
    throw new Error('Registration failed: missing agentId');
  }

  const agentId = registration.agentId;
  console.log(`Registered agentId: ${agentId}`);

  // 2) Load it back
  const loaded = await sdk.loadAgent(agentId);

  console.log(`Loaded agent: ${loaded.name}`);
  console.log(`Current description: ${loaded.description}`);

  // 3) Update agent information
  loaded.updateInfo(
    'Updated AI Assistant',
    'Updated description with new skills and pricing'
  );

  // Update metadata
  loaded.setMetadata({
    version: '1.1.0',
    tags: ['data_analyst', 'finance', 'coding'],
    pricing: '0.015', // Updated pricing
  });

  // Update endpoints if needed
  await loaded.setMCP('https://api.example.com/mcp-updated', '2025-06-18');

  // Optional: setAgentWallet is on-chain only and signature-gated in ERC-8004 Jan 2026.
  // Leaving it out here keeps the example focused on "update + re-register".
  // If you want to try it (one-wallet flow), uncomment:
  //
  // const newWalletAddress = (await sdk.web3Client.getAddress())!;
  // console.log('Setting agent wallet on-chain...');
  // const walletTxHash = await loaded.setAgentWallet(newWalletAddress);
  // console.log(`Agent wallet updated. Transaction: ${walletTxHash || '(skipped - already set)'}`);

  // 4) Re-register with updated information
  console.log('Updating agent registration...');
  const updatedRegistrationFile = await loaded.registerIPFS();
  console.log(`Agent updated. New URI: ${updatedRegistrationFile.agentURI}`);
}

main().catch(console.error);

