#!/usr/bin/env node

/**
 * Test script to verify semantic search filters work correctly
 * Tests defaultInputModes and defaultOutputModes filtering
 * 
 * Run with: npx tsx test-filters.js
 * Or: node --loader tsx test-filters.js
 */

import { SDK } from './src/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function testFilters() {
  console.log('🔍 Testing Semantic Search Filters\n');

  // Initialize SDK
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
        namespace: process.env.PINECONE_NAMESPACE,
      },
    },
  });

  try {
    // Test 1: Search without filters (baseline)
    console.log('📊 Test 1: Search without filters');
    const baseline = await sdk.semanticSearch.searchAgents({
      query: 'cryptocurrency intelligence',
      topK: 5,
    });
    console.log(`   Results: ${baseline.total}`);
    if (baseline.results.length > 0) {
      const first = baseline.results[0];
      console.log(`   First result: ${first.name}`);
      console.log(`   Metadata keys: ${Object.keys(first.metadata || {}).join(', ')}`);
      console.log(`   defaultInputModes: ${JSON.stringify(first.metadata?.defaultInputModes || 'N/A')}`);
      console.log(`   defaultOutputModes: ${JSON.stringify(first.metadata?.defaultOutputModes || 'N/A')}`);
      console.log(`   inputModes: ${JSON.stringify(first.metadata?.inputModes || 'N/A')}`);
      console.log(`   outputModes: ${JSON.stringify(first.metadata?.outputModes || 'N/A')}`);
    }
    console.log('');

    // Test 2: Filter by inputMode = "text"
    console.log('📊 Test 2: Filter by inputMode = "text"');
    const textFilter = await sdk.semanticSearch.searchAgents({
      query: 'cryptocurrency intelligence',
      topK: 5,
      filters: {
        inputMode: 'text',
      },
    });
    console.log(`   Results: ${textFilter.total}`);
    if (textFilter.results.length > 0) {
      textFilter.results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.name} - inputModes: ${JSON.stringify(r.metadata?.defaultInputModes || r.metadata?.inputModes || 'N/A')}`);
      });
    } else {
      console.log('   ⚠️  No results with inputMode="text" filter');
    }
    console.log('');

    // Test 3: Filter by inputMode = "mcp"
    console.log('📊 Test 3: Filter by inputMode = "mcp"');
    const mcpFilter = await sdk.semanticSearch.searchAgents({
      query: 'cryptocurrency intelligence',
      topK: 5,
      filters: {
        inputMode: 'mcp',
      },
    });
    console.log(`   Results: ${mcpFilter.total}`);
    if (mcpFilter.results.length > 0) {
      mcpFilter.results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.name} - inputModes: ${JSON.stringify(r.metadata?.defaultInputModes || r.metadata?.inputModes || 'N/A')}`);
      });
    } else {
      console.log('   ⚠️  No results with inputMode="mcp" filter');
    }
    console.log('');

    // Test 4: Filter by outputMode = "json"
    console.log('📊 Test 4: Filter by outputMode = "json"');
    const jsonFilter = await sdk.semanticSearch.searchAgents({
      query: 'cryptocurrency intelligence',
      topK: 5,
      filters: {
        outputMode: 'json',
      },
    });
    console.log(`   Results: ${jsonFilter.total}`);
    if (jsonFilter.results.length > 0) {
      jsonFilter.results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.name} - outputModes: ${JSON.stringify(r.metadata?.defaultOutputModes || r.metadata?.outputModes || 'N/A')}`);
      });
    } else {
      console.log('   ⚠️  No results with outputMode="json" filter');
    }
    console.log('');

    // Test 5: Combined filters
    console.log('📊 Test 5: Combined filters (inputMode="text" + outputMode="json")');
    const combinedFilter = await sdk.semanticSearch.searchAgents({
      query: 'cryptocurrency intelligence',
      topK: 5,
      filters: {
        inputMode: 'text',
        outputMode: 'json',
      },
    });
    console.log(`   Results: ${combinedFilter.total}`);
    if (combinedFilter.results.length > 0) {
      combinedFilter.results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.name}`);
        console.log(`      inputModes: ${JSON.stringify(r.metadata?.defaultInputModes || r.metadata?.inputModes || 'N/A')}`);
        console.log(`      outputModes: ${JSON.stringify(r.metadata?.defaultOutputModes || r.metadata?.outputModes || 'N/A')}`);
      });
    } else {
      console.log('   ⚠️  No results with combined filters');
    }
    console.log('');

    // Test 6: Check what field names are actually in the index
    console.log('📊 Test 6: Analyzing metadata field names in index');
    const analysis = await sdk.semanticSearch.searchAgents({
      query: 'agent',
      topK: 20,
    });
    
    const fieldStats = {
      hasDefaultInputModes: 0,
      hasDefaultOutputModes: 0,
      hasInputModes: 0,
      hasOutputModes: 0,
      emptyDefaultInputModes: 0,
      emptyDefaultOutputModes: 0,
      emptyInputModes: 0,
      emptyOutputModes: 0,
    };

    analysis.results.forEach(r => {
      const meta = r.metadata || {};
      if ('defaultInputModes' in meta) {
        fieldStats.hasDefaultInputModes++;
        if (!meta.defaultInputModes || meta.defaultInputModes.length === 0) {
          fieldStats.emptyDefaultInputModes++;
        }
      }
      if ('defaultOutputModes' in meta) {
        fieldStats.hasDefaultOutputModes++;
        if (!meta.defaultOutputModes || meta.defaultOutputModes.length === 0) {
          fieldStats.emptyDefaultOutputModes++;
        }
      }
      if ('inputModes' in meta) {
        fieldStats.hasInputModes++;
        if (!meta.inputModes || meta.inputModes.length === 0) {
          fieldStats.emptyInputModes++;
        }
      }
      if ('outputModes' in meta) {
        fieldStats.hasOutputModes++;
        if (!meta.outputModes || meta.outputModes.length === 0) {
          fieldStats.emptyOutputModes++;
        }
      }
    });

    console.log(`   Analyzed ${analysis.total} results:`);
    console.log(`   - Records with defaultInputModes: ${fieldStats.hasDefaultInputModes} (${fieldStats.emptyDefaultInputModes} empty)`);
    console.log(`   - Records with defaultOutputModes: ${fieldStats.hasDefaultOutputModes} (${fieldStats.emptyDefaultOutputModes} empty)`);
    console.log(`   - Records with inputModes: ${fieldStats.hasInputModes} (${fieldStats.emptyInputModes} empty)`);
    console.log(`   - Records with outputModes: ${fieldStats.hasOutputModes} (${fieldStats.emptyOutputModes} empty)`);
    
    // Show sample values
    const withDefaultInput = analysis.results.find(r => r.metadata?.defaultInputModes?.length > 0);
    if (withDefaultInput) {
      console.log(`\n   Sample record with defaultInputModes:`);
      console.log(`   - Name: ${withDefaultInput.name}`);
      console.log(`   - defaultInputModes: ${JSON.stringify(withDefaultInput.metadata.defaultInputModes)}`);
      console.log(`   - defaultOutputModes: ${JSON.stringify(withDefaultInput.metadata.defaultOutputModes)}`);
    }

    console.log('\n📝 Summary:');
    console.log('   - Current index uses: inputModes/outputModes (all empty)');
    console.log('   - Filter expects: defaultInputModes/defaultOutputModes');
    console.log('   - Solution: Re-index data with agent0-ts to populate defaultInputModes/defaultOutputModes');
    console.log('\n✅ Filter tests complete!\n');

  } catch (error) {
    console.error('❌ Error testing filters:', error);
    process.exit(1);
  }
}

testFilters();

