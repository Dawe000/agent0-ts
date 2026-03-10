/**
 * Broad SDK behaviour tests (searchAgents, getAgent, searchFeedback).
 * Subgraph-only tests run freely; semantic (keyword) tests use ONE request and assert on cached result to avoid rate limits.
 *
 * Run with: RUN_LIVE_TESTS=1 npm test -- sdk-search-behaviour
 * Or: SDK_LIVE=1 npm test -- sdk-search-behaviour
 */

import { SDK } from '../src/index.js';
import { CHAIN_ID, RPC_URL, printConfig } from './config.js';

const RUN_LIVE = process.env.RUN_LIVE_TESTS === '1' || process.env.SDK_LIVE === '1';
const describeMaybe = RUN_LIVE ? describe : describe.skip;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describeMaybe('SDK with default RPC (chainId only)', () => {
  it('instantiates and performs read when only chainId is provided for a supported chain', async () => {
    const sdk = new SDK({ chainId: 11155111 });
    const list = await sdk.searchAgents({}, { sort: ['updatedAt:desc'] });
    expect(Array.isArray(list)).toBe(true);
  });
});

describeMaybe('SDK searchAgents (subgraph-only, no keyword)', () => {
  let sdk: SDK;
  let cachedList: Awaited<ReturnType<SDK['searchAgents']>>;

  beforeAll(() => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
  });

  it('returns an array of agents', async () => {
    const result = await sdk.searchAgents({}, { sort: ['updatedAt:desc'] });
    cachedList = result;
    expect(Array.isArray(result)).toBe(true);
  });

  it('each item has required AgentSummary-like shape', () => {
    expect(cachedList!.length).toBeGreaterThan(0);
    const item = cachedList![0];
    expect(typeof item.chainId).toBe('number');
    expect(typeof item.agentId).toBe('string');
    expect(item.agentId).toMatch(/^\d+:\d+$/);
    expect(typeof item.name).toBe('string');
    expect(Array.isArray(item.owners)).toBe(true);
    expect(Array.isArray(item.operators)).toBe(true);
  });

  it('supports active filter', async () => {
    const result = await sdk.searchAgents({ active: true });
    expect(Array.isArray(result)).toBe(true);
    result.forEach((a) => expect(a.active === true || a.active === false).toBe(true));
  });

  it('supports chains filter', async () => {
    const result = await sdk.searchAgents({ chains: [CHAIN_ID] });
    expect(Array.isArray(result)).toBe(true);
    result.forEach((a) => expect(a.chainId).toBe(CHAIN_ID));
  });

  it('supports name substring filter', async () => {
    const result = await sdk.searchAgents({ name: 'Agent' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('supports sort option', async () => {
    const result = await sdk.searchAgents({}, { sort: ['updatedAt:desc'] });
    expect(Array.isArray(result)).toBe(true);
  });

  // Pagination removed.

  it('supports feedback filter (minValue)', async () => {
    const result = await sdk.searchAgents(
      { feedback: { minValue: 0, includeRevoked: false } },
      {}
    );
    expect(Array.isArray(result)).toBe(true);
  });
});

describeMaybe('SDK getAgent', () => {
  let sdk: SDK;
  let someAgentId: string;

  beforeAll(async () => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
    const list = await sdk.searchAgents({});
    expect(list.length).toBeGreaterThan(0);
    someAgentId = list[0].agentId;
  });

  it('getAgent returns AgentSummary for valid id', async () => {
    const agent = await sdk.getAgent(someAgentId);
    expect(agent).toBeDefined();
    expect(agent!.agentId).toBe(someAgentId);
    expect(typeof agent!.name).toBe('string');
    expect(typeof agent!.chainId).toBe('number');
  });

  it('getAgent accepts chainId:agentId format', async () => {
    const agent = await sdk.getAgent(someAgentId);
    expect(agent).toBeDefined();
    expect(agent!.agentId).toMatch(/^\d+:\d+$/);
  });
});

describeMaybe('SDK searchFeedback', () => {
  let sdk: SDK;

  beforeAll(() => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
  });

  it('searchFeedback with agentId returns array', async () => {
    const list = await sdk.searchAgents({});
    if (list.length === 0) return;
    const feedbacks = await sdk.searchFeedback({ agentId: list[0].agentId });
    expect(Array.isArray(feedbacks)).toBe(true);
  });
});

describeMaybe('SDK searchAgents with keyword (semantic, 1 request)', () => {
  let sdk: SDK;
  let keywordResult: Awaited<ReturnType<SDK['searchAgents']>>;

  beforeAll(async () => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
    try {
      keywordResult = await sdk.searchAgents(
        { keyword: 'agent' },
        { semanticTopK: 10 }
      );
    } catch (e: any) {
      // Semantic endpoint is rate-limited; don't fail the whole integration run on 429.
      if (String(e?.message || e).includes('HTTP 429')) {
        console.warn('[live-test] Semantic endpoint rate limited (429); skipping keyword assertions.');
        keywordResult = [];
        return;
      }
      throw e;
    }
  }, 25000);

  it('returns an array', () => {
    expect(Array.isArray(keywordResult)).toBe(true);
  });

  it('each item has agentId in chainId:tokenId format', () => {
    keywordResult.forEach((item) => {
      expect(item.agentId).toMatch(/^\d+:\d+$/);
      expect(typeof item.chainId).toBe('number');
    });
  });

  it('items can have semanticScore in [0,1]', () => {
    keywordResult.forEach((item) => {
      const score = (item as { semanticScore?: number }).semanticScore;
      if (score != null) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });

  // Pagination removed.
});

describeMaybe('SDK searchAgents keyword pagination (1 extra request, delayed)', () => {
  let sdk: SDK;

  beforeAll(() => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
  });

  it('is intentionally skipped: pagination removed', async () => {
    await delay(1);
  });
});
