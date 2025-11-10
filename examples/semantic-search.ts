/**
 * Semantic Search Example
 *
 * Demonstrates how to:
 * 1. Initialize the SDK with Venice + Pinecone providers.
 * 2. Index an agent card into the vector store.
 * 3. Run a semantic query and inspect the results.
 * 4. (Optional) Clean up the inserted vector.
 *
 * Requirements:
 *   - VENICE_API_KEY
 *   - PINECONE_API_KEY
 *   - PINECONE_INDEX (existing index with matching vector dimension)
 *   - Optional: PINECONE_NAMESPACE
 *   - RPC_URL (any HTTPS Sepolia endpoint for SDK initialization)
 *
 * Run with:
 *   node --loader ts-node/esm examples/semantic-search.ts
 */

import 'dotenv/config';
import { SDK } from '../src/index.js';
import type { SemanticAgentRecord } from '../src/semantic-search/index.js';

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

  const demoAgents: SemanticAgentRecord[] = [
    {
      chainId,
      agentId: `${chainId}:demo-navigator-${Date.now()}`,
      name: 'Portfolio Navigator',
      description:
        'Analyzes DeFi portfolios, suggests yield strategies, and balances risk across chains.',
      capabilities: ['defi', 'portfolio-optimizer', 'risk-assessment'],
      defaultInputModes: ['text'],
      defaultOutputModes: ['json'],
      tags: ['finance', 'yield', 'analysis'],
      metadata: {
        provider: 'demo',
        version: '1.0.0',
        docs: 'https://example.com/portfolio-navigator',
      },
    },
    {
      chainId,
      agentId: `${chainId}:demo-guardian-${Date.now() + 1}`,
      name: 'Security Guardian',
      description: 'Detects smart-contract vulnerabilities and recommends mitigations.',
      capabilities: ['audit', 'threat-detection'],
      defaultInputModes: ['text'],
      defaultOutputModes: ['markdown'],
      tags: ['security', 'audit'],
      metadata: {
        provider: 'demo',
        version: '1.1.0',
        docs: 'https://example.com/security-guardian',
      },
    },
    {
      chainId,
      agentId: `${chainId}:demo-lingo-${Date.now() + 2}`,
      name: 'Lingo Translator',
      description: 'Translates technical documentation into multiple languages with context.',
      capabilities: ['translation', 'localization'],
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      tags: ['language', 'documentation'],
      metadata: {
        provider: 'demo',
        version: '2.0.0',
      },
    },
    {
      chainId,
      agentId: `${chainId}:demo-supply-${Date.now() + 3}`,
      name: 'Supply Optimizer',
      description: 'Optimizes logistics for AI supply chains using predictive analytics.',
      capabilities: ['logistics', 'forecasting'],
      defaultInputModes: ['json'],
      defaultOutputModes: ['json'],
      tags: ['logistics', 'planning'],
      metadata: {
        provider: 'demo',
        version: '0.9.1',
      },
    },
    {
      chainId,
      agentId: `${chainId}:demo-cortex-${Date.now() + 4}`,
      name: 'Creative Cortex',
      description: 'Generates campaign concepts and multimedia briefs for marketing teams.',
      capabilities: ['content-strategy', 'creative-writing'],
      defaultInputModes: ['text'],
      defaultOutputModes: ['markdown', 'json'],
      tags: ['marketing', 'creative'],
      metadata: {
        provider: 'demo',
        version: '1.3.5',
      },
    },
  ];

  console.log('Indexing demo agents into Pinecone...');
  await sdk.semanticIndexAgentsBatch(demoAgents);
  console.log('Indexed agents:', demoAgents.map(agent => agent.agentId).join(', '));

  console.log('\nRunning semantic search query: "optimize defi yield"');
  const searchResponse = await sdk.semanticSearchAgents({
    query: 'Optimize my DeFi portfolio for stable yields with low risk.',
    topK: 5,
    minScore: 0.5,
    filters: {
      capabilities: ['defi'],
    },
  });

  if (searchResponse.results.length === 0) {
    console.log('No results found for the query.');
  } else {
    for (const result of searchResponse.results) {
      console.log('\nMatch:');
      console.log(`  Rank: ${result.rank}`);
      console.log(`  Agent ID: ${result.agentId}`);
      console.log(`  Name: ${result.name ?? 'N/A'}`);
      console.log(`  Score: ${result.score.toFixed(4)}`);
      if (result.matchReasons && result.matchReasons.length > 0) {
        console.log(`  Reasons: ${result.matchReasons.join(' | ')}`);
      }
      if (result.metadata) {
        console.log('  Metadata:', JSON.stringify(result.metadata, null, 2));
      }
    }
  }

  if (process.env.CLEANUP_SEMANTIC_DEMO === 'true') {
    console.log('\nCleaning up demo vector...');
    const deletions = demoAgents.map(agent => ({
      chainId: agent.chainId,
      agentId: agent.agentId,
    }));
    await sdk.semanticDeleteAgentsBatch(deletions);
    console.log('Demo agents removed from vector store.');
  }
}

main().catch(error => {
  console.error('Semantic search demo failed:', error);
  process.exitCode = 1;
});

