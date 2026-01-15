/**
 * Agent Transfer Example
 * 
 * This example demonstrates how to:
 * 1. Create and register a new agent (so the signer is the owner)
 * 2. Transfer the agent to a new owner
 * 3. Verify new owner on-chain
 */

import { SDK } from '../src/index';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

async function main() {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  const pinataJwt = process.env.PINATA_JWT;

  if (!rpcUrl || rpcUrl.trim() === '') {
    throw new Error('RPC_URL is required for this example');
  }
  if (!privateKey || privateKey.trim() === '') {
    throw new Error('PRIVATE_KEY (or AGENT_PRIVATE_KEY) is required for this example');
  }
  if (!pinataJwt || pinataJwt.trim() === '') {
    throw new Error('PINATA_JWT is required for this example (registerIPFS uses pinata)');
  }

  // Initialize SDK
  const sdk = new SDK({
    chainId: 11155111, // Ethereum Sepolia
    rpcUrl,
    privateKey, // Required for transfers
    ipfs: 'pinata',
    pinataJwt,
  });

  // Create + register a fresh agent (self-contained example)
  const agent = sdk.createAgent(
    'Transfer Example Agent',
    'An agent created by the transfer example script.',
    'https://example.com/agent-image.png'
  );
  await agent.setMCP('https://api.example.com/mcp', '2025-06-18');
  agent.setActive(true);

  console.log('Registering a new agent (setup for transfer)...');
  const registration = await agent.registerIPFS();
  if (!registration.agentId) {
    throw new Error('Registration failed: missing agentId');
  }
  const agentId = registration.agentId;
  console.log(`Registered agentId: ${agentId}`);

  // Destination owner (provide NEW_OWNER to make this deterministic)
  const newOwner =
    process.env.NEW_OWNER && process.env.NEW_OWNER.trim() !== ''
      ? process.env.NEW_OWNER
      : privateKeyToAccount(generatePrivateKey()).address;

  // Transfer agent
  console.log(`\nTransferring agent ${agentId} to ${newOwner}...`);
  const result = await sdk.transferAgent(agentId, newOwner);
  console.log(`Transfer completed!`);
  console.log(`Transaction hash: ${result.txHash}`);
  console.log(`From: ${result.from}`);
  console.log(`To: ${result.to}`);
  console.log(`Agent ID: ${result.agentId}`);

  // Verify new owner
  // Note: transfers are asynchronous; wait for the tx to be mined before reading ownerOf.
  await sdk.chainClient.waitForTransaction({ hash: result.txHash as any });

  console.log('\nVerifying new owner...');
  let newOwnerAddress = await sdk.getAgentOwner(agentId);
  // Poll briefly in case RPC is behind / re-org / propagation delay.
  for (let i = 0; i < 10; i++) {
    if (newOwnerAddress.toLowerCase() === newOwner.toLowerCase()) break;
    await new Promise((r) => setTimeout(r, 3000));
    newOwnerAddress = await sdk.getAgentOwner(agentId);
  }
  console.log(`New owner: ${newOwnerAddress}`);
  const ok = newOwnerAddress.toLowerCase() === newOwner.toLowerCase();
  console.log(`Transfer successful: ${ok}`);
  if (!ok) {
    throw new Error(`Transfer tx mined but owner did not update to ${newOwner}`);
  }
}

main().catch(console.error);

