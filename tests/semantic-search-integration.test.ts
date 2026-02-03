/**
 * Integration tests for semantic search via SDK (sdk.searchAgents with keyword).
 * Run with: RUN_LIVE_TESTS=1 npm test -- semantic-search-integration
 * Or: SEMANTIC_SEARCH_LIVE=1 npm test -- semantic-search-integration
 */

import { SDK } from '../src/index.js';
import { CHAIN_ID, RPC_URL, printConfig } from './config.js';

const RUN_LIVE = process.env.RUN_LIVE_TESTS === '1' || process.env.SEMANTIC_SEARCH_LIVE === '1';
const describeMaybe = RUN_LIVE ? describe : describe.skip;

describeMaybe('Semantic search via SDK (live)', () => {
  let sdk: SDK;

  beforeAll(() => {
    printConfig();
    sdk = new SDK({
      chainId: CHAIN_ID,
      rpcUrl: RPC_URL,
    });
  });

  it('returns results for a non-empty keyword query', async () => {
    const result = await sdk.searchAgents(
      { keyword: 'crypto agent' },
      { pageSize: 5, semanticTopK: 10 }
    );
    expect(result.items).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(5);
  });

  it('each item has chainId, agentId (chainId:tokenId), and optional semanticScore', async () => {
    const result = await sdk.searchAgents(
      { keyword: 'agent' },
      { pageSize: 3, semanticTopK: 5 }
    );
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(typeof item.chainId).toBe('number');
      expect(typeof item.agentId).toBe('string');
      expect(item.agentId).toMatch(/^\d+:\d+$/);
      if ((item as { semanticScore?: number }).semanticScore != null) {
        const score = (item as { semanticScore: number }).semanticScore;
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('respects pageSize', async () => {
    const result = await sdk.searchAgents(
      { keyword: 'agent' },
      { pageSize: 2, semanticTopK: 5 }
    );
    expect(result.items.length).toBeLessThanOrEqual(2);
  });

  it('returns valid structure (single query to avoid rate limit)', async () => {
    const result = await sdk.searchAgents(
      { keyword: 'assistant' },
      { pageSize: 2, semanticTopK: 5 }
    );
    expect(Array.isArray(result.items)).toBe(true);
    if (result.items.length > 0) {
      expect(result.items[0].agentId).toMatch(/^\d+:\d+$/);
      expect(typeof result.items[0].chainId).toBe('number');
    }
  });
});
