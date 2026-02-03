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

describeMaybe('SDK searchAgents (subgraph-only, no keyword)', () => {
  let sdk: SDK;
  let cachedList: Awaited<ReturnType<SDK['searchAgents']>>;

  beforeAll(() => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
  });

  it('returns items array and optional meta', async () => {
    const result = await sdk.searchAgents({}, { pageSize: 5 });
    cachedList = result;
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBeLessThanOrEqual(5);
    expect(typeof result.nextCursor === 'string' || result.nextCursor === undefined).toBe(true);
    if (result.meta) {
      expect(result.meta.chains).toBeDefined();
      expect(result.meta.totalResults).toBeDefined();
    }
  });

  it('each item has required AgentSummary-like shape', () => {
    expect(cachedList!.items.length).toBeGreaterThan(0);
    const item = cachedList!.items[0];
    expect(typeof item.chainId).toBe('number');
    expect(typeof item.agentId).toBe('string');
    expect(item.agentId).toMatch(/^\d+:\d+$/);
    expect(typeof item.name).toBe('string');
    expect(Array.isArray(item.owners)).toBe(true);
    expect(Array.isArray(item.operators)).toBe(true);
  });

  it('respects pageSize option', async () => {
    const result = await sdk.searchAgents({}, { pageSize: 2 });
    expect(result.items.length).toBeLessThanOrEqual(2);
  });

  it('supports active filter', async () => {
    const result = await sdk.searchAgents({ active: true }, { pageSize: 3 });
    expect(Array.isArray(result.items)).toBe(true);
    result.items.forEach((a) => expect(a.active === true || a.active === false).toBe(true));
  });

  it('supports chains filter', async () => {
    const result = await sdk.searchAgents({ chains: [CHAIN_ID] }, { pageSize: 3 });
    expect(Array.isArray(result.items)).toBe(true);
    result.items.forEach((a) => expect(a.chainId).toBe(CHAIN_ID));
  });

  it('supports name substring filter', async () => {
    const result = await sdk.searchAgents({ name: 'Agent' }, { pageSize: 5 });
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('supports sort option', async () => {
    const result = await sdk.searchAgents({}, { pageSize: 3, sort: ['updatedAt:desc'] });
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('cursor pagination returns different items', async () => {
    const page1 = await sdk.searchAgents({}, { pageSize: 2 });
    if (!page1.nextCursor || page1.items.length === 0) return;
    const page2 = await sdk.searchAgents({}, { pageSize: 2, cursor: page1.nextCursor });
    const ids1 = page1.items.map((a) => a.agentId);
    const ids2 = page2.items.map((a) => a.agentId);
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap.length).toBe(0);
  });

  it('supports feedback filter (minValue)', async () => {
    const result = await sdk.searchAgents(
      { feedback: { minValue: 0, includeRevoked: false } },
      { pageSize: 3 }
    );
    expect(Array.isArray(result.items)).toBe(true);
  });
});

describeMaybe('SDK getAgent', () => {
  let sdk: SDK;
  let someAgentId: string;

  beforeAll(async () => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
    const list = await sdk.searchAgents({}, { pageSize: 1 });
    expect(list.items.length).toBeGreaterThan(0);
    someAgentId = list.items[0].agentId;
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
    const list = await sdk.searchAgents({}, { pageSize: 1 });
    if (list.items.length === 0) return;
    const feedbacks = await sdk.searchFeedback({ agentId: list.items[0].agentId });
    expect(Array.isArray(feedbacks)).toBe(true);
  });
});

describeMaybe('SDK searchAgents with keyword (semantic, 1 request)', () => {
  let sdk: SDK;
  let keywordResult: Awaited<ReturnType<SDK['searchAgents']>>;

  beforeAll(async () => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
    keywordResult = await sdk.searchAgents(
      { keyword: 'agent' },
      { pageSize: 5, semanticTopK: 10 }
    );
  }, 25000);

  it('returns items array', () => {
    expect(Array.isArray(keywordResult.items)).toBe(true);
  });

  it('each item has agentId in chainId:tokenId format', () => {
    keywordResult.items.forEach((item) => {
      expect(item.agentId).toMatch(/^\d+:\d+$/);
      expect(typeof item.chainId).toBe('number');
    });
  });

  it('items can have semanticScore in [0,1]', () => {
    keywordResult.items.forEach((item) => {
      const score = (item as { semanticScore?: number }).semanticScore;
      if (score != null) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });

  it('respects pageSize', () => {
    expect(keywordResult.items.length).toBeLessThanOrEqual(5);
  });

  it('result has nextCursor when more results exist', () => {
    if (keywordResult.items.length >= 5 && keywordResult.nextCursor) {
      expect(typeof keywordResult.nextCursor).toBe('string');
    }
  });
});

describeMaybe('SDK searchAgents keyword pagination (1 extra request, delayed)', () => {
  let sdk: SDK;

  beforeAll(() => {
    printConfig();
    sdk = new SDK({ chainId: CHAIN_ID, rpcUrl: RPC_URL });
  });

  it('cursor with keyword returns next page without overlap', async () => {
    await delay(2500);
    const page1 = await sdk.searchAgents(
      { keyword: 'crypto' },
      { pageSize: 2, semanticTopK: 10 }
    );
    if (!page1.nextCursor || page1.items.length === 0) return;
    const page2 = await sdk.searchAgents(
      { keyword: 'crypto' },
      { pageSize: 2, semanticTopK: 10, cursor: page1.nextCursor }
    );
    const ids1 = page1.items.map((a) => a.agentId);
    const ids2 = page2.items.map((a) => a.agentId);
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap.length).toBe(0);
  }, 30000);
});
