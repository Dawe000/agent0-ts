/**
 * Crash-safe semantic sync example.
 *
 * This script demonstrates how to keep the semantic search index in sync
 * with the on-chain identity registry using the subgraph. It stores a
 * progress marker on disk so it can resume after interruptions.
 *
 * Required env vars:
 *   RPC_URL
 *   CHAIN_ID (default 11155111)
 *   VENICE_API_KEY
 *   PINECONE_API_KEY
 *   PINECONE_INDEX
 *
 * Optional env vars:
 *   PINECONE_NAMESPACE
 *   VENICE_MODEL
 *   SEMANTIC_SYNC_STATE (defaults to .cache/semantic-sync-state.json)
 */

import 'dotenv/config';
import { SDK } from '../src/index.js';
import {
  FileSemanticSyncStateStore,
  SemanticSyncRunner,
} from '../src/semantic-search/index.js';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

async function main() {
  const chainId = Number(process.env.CHAIN_ID || 11155111);
  const rpcUrl = requireEnv('RPC_URL');
  const veniceApiKey = requireEnv('VENICE_API_KEY');
  const pineconeApiKey = requireEnv('PINECONE_API_KEY');
  const pineconeIndex = requireEnv('PINECONE_INDEX');
  const pineconeNamespace = process.env.PINECONE_NAMESPACE;
  const veniceModel = process.env.VENICE_MODEL || 'text-embedding-bge-m3';

  const sdk = new SDK({
    chainId,
    rpcUrl,
    semanticSearch: {
      embedding: {
        provider: 'venice',
        apiKey: veniceApiKey,
        model: veniceModel,
      },
      vectorStore: {
        provider: 'pinecone',
        apiKey: pineconeApiKey,
        index: pineconeIndex,
        namespace: pineconeNamespace,
      },
    },
  });

  const statePath = process.env.SEMANTIC_SYNC_STATE || '.cache/semantic-sync-state.json';
  const store = new FileSemanticSyncStateStore({ filepath: statePath });

  const runner = new SemanticSyncRunner(sdk, {
    batchSize: 50,
    stateStore: store,
    logger: (event, extra) => {
      console.log(`[semantic-sync] ${event}`, extra ?? {});
    },
  });

  await runner.run();
  console.log('Semantic sync completed.');
}

main().catch(error => {
  console.error('Semantic sync failed:', error);
  process.exitCode = 1;
});

