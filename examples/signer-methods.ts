/**
 * Signer Methods Example
 * 
 * This example demonstrates the two ways to configure a signer in the SDK:
 * 1. Using a private key string
 * 2. Browser: using an EIP-1193 wallet provider (ERC-6963)
 */

import { SDK } from '../src/index';
import { discoverEip6963Providers, connectEip1193 } from '../src/browser/eip6963.js';

async function main() {
  console.log('=== Agent0 SDK - Signer Configuration Methods ===\n');

  // ========================================
  // Method 1: Using a private key string
  // ========================================
  console.log('Method 1: Private Key String');
  console.log('-------------------------------');
  
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY;
  if (!rpcUrl || rpcUrl.trim() === '') {
    throw new Error('RPC_URL is required for this example');
  }
  if (!privateKey || privateKey.trim() === '') {
    throw new Error('PRIVATE_KEY (or AGENT_PRIVATE_KEY) is required for this example');
  }

  const sdkWithPrivateKey = new SDK({
    chainId: 11155111, // Ethereum Sepolia
    rpcUrl,
    privateKey, // String: private key
  });

  console.log('✓ SDK initialized with private key string');
  console.log(`  Read-only mode: ${sdkWithPrivateKey.isReadOnly}`);
  if (!sdkWithPrivateKey.isReadOnly) {
    console.log(`  Signer address: ${await sdkWithPrivateKey.chainClient.getAddress()}`);
  }
  console.log();

  // ========================================
  // Method 2: Browser wallet (ERC-6963 / EIP-1193)
  // ========================================
  console.log('Method 2: Browser Wallet (ERC-6963 / EIP-1193)');
  console.log('-------------------------------');

  console.log('Note: This requires running in a browser (or a test environment with injected wallets).');
  const providers = await discoverEip6963Providers({ timeoutMs: 250 });
  if (providers.length === 0) {
    console.log('  No ERC-6963 providers found.\n');
  } else {
    const selected = providers[0];
    const { account } = await connectEip1193(selected.provider, { requestAccounts: false });
    const sdkWithWalletProvider = new SDK({
      chainId: 11155111,
      rpcUrl: process.env.RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
      walletProvider: selected.provider,
    });

    console.log(`✓ Found provider: ${selected.info.name} (${selected.info.rdns})`);
    console.log(`  Connected account (if already authorized): ${account || 'none'}`);
    console.log(`  Read-only mode: ${sdkWithWalletProvider.isReadOnly}`);
  }
  console.log();

  // ========================================
  // Method 4: Read-only mode (no signer)
  // ========================================
  console.log('Method 4: Read-Only Mode (No Signer)');
  console.log('--------------------------------------');
  
  const readOnlySdk = new SDK({
    chainId: 11155111,
    rpcUrl: process.env.RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
    // No signer provided - read-only mode
  });

  console.log('✓ SDK initialized in read-only mode');
  console.log(`  Read-only mode: ${readOnlySdk.isReadOnly}`);
  console.log('  Can search agents: ✓');
  console.log('  Can read feedback: ✓');
  console.log('  Can register agents: ✗ (requires signer)');
  console.log('  Can give feedback: ✗ (requires signer)');
  console.log();

  // ========================================
  // Using the SDK with different signers
  // ========================================
  console.log('=== Example Usage ===');
  console.log('---------------------');
  
  try {
    // This works with any of the above signer methods
    const agent = sdkWithWallet.createAgent(
      'Test Agent',
      'An agent created with Wallet signer',
      'https://example.com/image.png'
    );
    
    console.log('✓ Agent created successfully');
    console.log(`  Ready for configuration and registration`);
    
    // Note: Actual registration would require valid configuration
    // await agent.registerIPFS();
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
