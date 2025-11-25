import { SDK } from './src/index.js';
import dotenv from 'dotenv';
dotenv.config();

const sdk = new SDK({
  rpcUrl: process.env.RPC_URL,
  chainId: Number(process.env.CHAIN_ID || '11155111'),
  semanticSearch: {
    embedding: { provider: 'venice', apiKey: process.env.VENICE_API_KEY },
    vectorStore: {
      provider: 'pinecone',
      apiKey: process.env.PINECONE_API_KEY,
      index: process.env.PINECONE_INDEX,
      namespace: process.env.PINECONE_NAMESPACE,
    },
  },
});

// Search for a specific agent ID that we know has defaultInputModes
const results = await sdk.semanticSearch.searchAgents({
  query: 'deep42',
  topK: 5,
});

console.log('Query results:', results.total);
if (results.results.length > 0) {
  const first = results.results[0];
  console.log('\nFirst result metadata (ALL keys):');
  console.log(JSON.stringify(first.metadata, null, 2));
  
  console.log('\nChecking specific fields:');
  console.log('  defaultInputModes:', first.metadata?.defaultInputModes);
  console.log('  defaultOutputModes:', first.metadata?.defaultOutputModes);
  console.log('  inputModes:', first.metadata?.inputModes);
  console.log('  outputModes:', first.metadata?.outputModes);
  
  // Try to query by specific ID that we know has defaultInputModes
  console.log('\n--- Checking if namespace matters ---');
  console.log('Namespace:', process.env.PINECONE_NAMESPACE || 'default');
  
  // Check all results for any with defaultInputModes
  const allResults = await sdk.semanticSearch.searchAgents({
    query: 'agent',
    topK: 50,
  });
  
  const withDefault = allResults.results.filter(r => {
    const meta = r.metadata || {};
    return meta.defaultInputModes && Array.isArray(meta.defaultInputModes) && meta.defaultInputModes.length > 0;
  });
  
  console.log(`\nFound ${withDefault.length} results with defaultInputModes out of ${allResults.total}`);
  if (withDefault.length > 0) {
    console.log('\nSample records with defaultInputModes:');
    withDefault.slice(0, 3).forEach(r => {
      console.log(`  ID: ${r.vectorId}`);
      console.log(`  Name: ${r.name}`);
      console.log(`  defaultInputModes: ${JSON.stringify(r.metadata.defaultInputModes)}`);
      console.log(`  defaultOutputModes: ${JSON.stringify(r.metadata.defaultOutputModes)}`);
      console.log('');
    });
  }
}

