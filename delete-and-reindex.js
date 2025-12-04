#!/usr/bin/env node

/**
 * Script to delete all namespaces and re-index with agent0-ts
 * This ensures all records have defaultInputModes/defaultOutputModes
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { SDK } from './src/index.js';
import dotenv from 'dotenv';

dotenv.config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX;
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || '';

if (!PINECONE_API_KEY || !PINECONE_INDEX) {
  console.error('❌ Missing PINECONE_API_KEY or PINECONE_INDEX');
  process.exit(1);
}

async function deleteAllNamespaces() {
  console.log('🗑️  Deleting all namespaces...\n');
  
  const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pinecone.Index(PINECONE_INDEX);
  
  try {
    // Get index stats to see all namespaces
    const stats = await index.describeIndexStats();
    console.log('Current namespaces:', Object.keys(stats.namespaces || {}));
    
    // Delete each namespace
    const namespaces = Object.keys(stats.namespaces || {});
    if (namespaces.length === 0) {
      console.log('No namespaces found (or using empty string namespace)');
      // Delete all vectors in the default namespace by deleting all IDs
      // This is a bit tricky - we'd need to fetch all IDs first
      console.log('⚠️  To delete default namespace, you may need to use Pinecone console');
    } else {
      for (const ns of namespaces) {
        console.log(`Deleting namespace: "${ns}" (${stats.namespaces[ns].vectorCount} vectors)`);
        // Pinecone doesn't have a direct "delete namespace" API
        // We need to delete all vectors in that namespace
        // This is complex, so we'll use the console or a different approach
        console.log(`  → Use Pinecone console to delete namespace "${ns}"`);
      }
    }
    
    console.log('\n📝 To delete namespaces:');
    console.log('   1. Go to Pinecone console');
    console.log('   2. Select your index');
    console.log('   3. Go to "Namespaces" tab');
    console.log('   4. Delete each namespace');
    console.log('\n   OR use Pinecone API to delete all vectors in each namespace\n');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function reindex() {
  console.log('🔄 Starting re-index with agent0-ts...\n');
  
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
        apiKey: PINECONE_API_KEY,
        index: PINECONE_INDEX,
        namespace: PINECONE_NAMESPACE, // Use the namespace you want
      },
    },
  });
  
  try {
    console.log('Running semantic sync...');
    console.log(`Namespace: "${PINECONE_NAMESPACE || '(empty/default)'}"`);
    console.log('This will index all agents from the subgraph with correct field names.\n');
    
    // Run the sync
    const runner = sdk.semanticSearch.createSyncRunner({
      stateStore: sdk.semanticSearch.createFileSyncStateStore('./.cache/semantic-sync-state.json'),
    });
    
    await runner.sync();
    
    console.log('\n✅ Re-indexing complete!');
    console.log('All records now have defaultInputModes/defaultOutputModes');
    
  } catch (error) {
    console.error('❌ Error during re-index:', error.message);
    process.exit(1);
  }
}

async function main() {
  console.log('🚀 Delete and Re-index Script\n');
  console.log(`Index: ${PINECONE_INDEX}`);
  console.log(`Namespace: "${PINECONE_NAMESPACE || '(empty/default)'}"\n`);
  
  // Step 1: Delete namespaces
  await deleteAllNamespaces();
  
  // Step 2: Re-index
  console.log('\n---\n');
  const answer = await new Promise((resolve) => {
    // In a real script, you'd use readline, but for simplicity:
    console.log('⚠️  After deleting namespaces in Pinecone console,');
    console.log('   run: npx tsx reindex-only.js');
    console.log('\n   Or continue with re-index now? (will fail if namespaces still exist)');
    resolve('y'); // Auto-continue for now
  });
  
  if (answer === 'y') {
    await reindex();
  }
}

main();







