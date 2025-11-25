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

// Search with very high topK to get more records
const results = await sdk.semanticSearch.searchAgents({
  query: 'agent',
  topK: 100,
});

console.log('Total results:', results.total);
const withDefault = results.results.filter(r => r.metadata?.defaultInputModes?.length > 0);
console.log('Records with populated defaultInputModes:', withDefault.length);
if (withDefault.length > 0) {
  console.log('\nSample records with defaultInputModes:');
  withDefault.slice(0, 5).forEach(r => {
    console.log(`  - ${r.name}: ${JSON.stringify(r.metadata.defaultInputModes)}`);
  });
} else {
  console.log('\n❌ NO records found with defaultInputModes populated');
  console.log('   This means your index needs to be re-indexed with agent0-ts');
}

