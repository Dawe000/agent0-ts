#!/usr/bin/env node

/**
 * Re-index script (run after deleting namespaces)
 */

import { SDK } from './src/index.js';
import dotenv from 'dotenv';

dotenv.config();

const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || '';

const sdk = new SDK({
  rpcUrl: process.env.RPC_URL,
  chainId: Number(process.env.CHAIN_ID || '11155111'),
  semanticSearch: {
    embedding: {
      provider: 'venice',
      apiKey: process.env.VENICE_API_KEY,
    },
    vectorStore: {
      provider: 'pinecone',
      apiKey: process.env.PINECONE_API_KEY,
      index: process.env.PINECONE_INDEX,
      namespace: PINECONE_NAMESPACE,
    },
  },
});

async function reindex() {
  console.log('🔄 Re-indexing with agent0-ts...\n');
  console.log(`Namespace: "${PINECONE_NAMESPACE || '(empty/default)'}"`);
  console.log('This will populate defaultInputModes/defaultOutputModes correctly\n');
  
  try {
    const runner = sdk.semanticSearch.createSyncRunner({
      stateStore: sdk.semanticSearch.createFileSyncStateStore('./.cache/semantic-sync-state.json'),
    });
    
    await runner.sync();
    
    console.log('\n✅ Re-indexing complete!');
    console.log('✅ All records now have:');
    console.log('   - defaultInputModes: ["mcp"] or ["text"]');
    console.log('   - defaultOutputModes: ["json"]');
    console.log('\n🎉 Filters should now work correctly!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

reindex();

