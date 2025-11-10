import { promises as fs } from 'fs';
import { mkdtempSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import {
  FileSemanticSyncStateStore,
  InMemorySemanticSyncStateStore,
  SemanticSyncRunner,
} from '../src/semantic-search/index.js';
import type { SemanticSyncState } from '../src/semantic-search/sync-state.js';
import type { SemanticSyncStateStore } from '../src/semantic-search/sync-state.js';
import type { SDK } from '../src/core/sdk.js';

describe('FileSemanticSyncStateStore', () => {
  test('persists and clears state on disk', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'semantic-sync-'));
    const file = path.join(dir, 'state.json');
    const store = new FileSemanticSyncStateStore({ filepath: file });

    expect(await store.load()).toBeNull();

    const state: SemanticSyncState = { lastUpdatedAt: '42', agentHashes: { foo: 'abc' } };
    await store.save(state);

    const reloaded = await store.load();
    expect(reloaded).toEqual(state);

    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe('SemanticSyncRunner', () => {
  interface TestAgent {
    id: string;
    chainId: string;
    agentId: string;
    updatedAt: string;
    registrationFile: any;
  }

  class FakeSubgraphClient {
    private data: TestAgent[] = [];

    constructor(initialData: TestAgent[]) {
      this.data = initialData;
    }

    setData(data: TestAgent[]) {
      this.data = data;
    }

    append(agent: TestAgent) {
      this.data.push(agent);
    }

    async query(): Promise<{ agents: TestAgent[] }> {
      throw new Error('query() signature with variables should be used.');
    }

    async queryWithVariables(
      _query: string,
      variables: { updatedAfter: string; first: number }
    ): Promise<{ agents: TestAgent[] }> {
      const updatedAfter = BigInt(variables.updatedAfter);
      const filtered = this.data
        .filter(agent => BigInt(agent.updatedAt) > updatedAfter)
        .sort((a, b) => Number(BigInt(a.updatedAt) - BigInt(b.updatedAt)))
        .slice(0, variables.first);
      return { agents: filtered };
    }

    // Proxy handler for the runner which calls subgraphClient.query(...)
    async queryProxy(query: string, variables: { updatedAfter: string; first: number }) {
      return this.queryWithVariables(query, variables);
    }
  }

  function createRunnerTestSdk(subgraphClient: FakeSubgraphClient, overrides: Partial<SDK> = {}) {
    const indexAgent = jest.fn();
    const indexAgentsBatch = jest.fn();
    const deleteAgentsBatch = jest.fn();

    const semanticSearchManager = {
      indexAgent,
      indexAgentsBatch,
    };

    const sdk = {
      semanticSearch: semanticSearchManager,
      semanticDeleteAgentsBatch: deleteAgentsBatch,
      subgraphClient: {
        query: subgraphClient.queryProxy.bind(subgraphClient),
      },
      ...overrides,
    } as unknown as SDK;

    return {
      sdk,
      indexAgent,
      indexAgentsBatch,
      deleteAgentsBatch,
    };
  }

  test('indexes new agents and persists state', async () => {
    const agents: TestAgent[] = [
      {
        id: '11155111:1',
        chainId: '11155111',
        agentId: '1',
        updatedAt: '10',
        registrationFile: {
          name: 'Alpha',
          description: 'Agent Alpha',
          supportedTrusts: [],
          mcpTools: [],
          mcpPrompts: [],
          mcpResources: [],
          a2aSkills: [],
        },
      },
      {
        id: '11155111:2',
        chainId: '11155111',
        agentId: '2',
        updatedAt: '20',
        registrationFile: {
          name: 'Beta',
          description: 'Agent Beta',
          supportedTrusts: [],
          mcpTools: ['tool'],
          mcpPrompts: [],
          mcpResources: [],
          a2aSkills: [],
        },
      },
      {
        id: '11155111:3',
        chainId: '11155111',
        agentId: '3',
        updatedAt: '25',
        registrationFile: null,
      },
    ];

    const subgraph = new FakeSubgraphClient(agents);
    const store = new InMemorySemanticSyncStateStore();
    const { sdk, indexAgent, indexAgentsBatch, deleteAgentsBatch } = createRunnerTestSdk(subgraph);

    const runner = new SemanticSyncRunner(sdk, {
      batchSize: 10,
      stateStore: store,
    });

    await runner.run();

    expect(indexAgentsBatch).toHaveBeenCalledTimes(1);
    const indexedPayload = indexAgentsBatch.mock.calls[0][0];
    expect(indexedPayload).toHaveLength(2);
    expect(deleteAgentsBatch).toHaveBeenCalledTimes(1);
    expect(deleteAgentsBatch.mock.calls[0][0]).toEqual([
      { chainId: 11155111, agentId: '11155111:3' },
    ]);

    const saved = await store.load();
    expect(saved?.lastUpdatedAt).toBe('25');
    expect(Object.keys(saved?.agentHashes ?? {})).toEqual(['11155111:1', '11155111:2']);

    indexAgent.mockClear();
    indexAgentsBatch.mockClear();
    deleteAgentsBatch.mockClear();

    // Second run with no changes should be a no-op.
    await runner.run();
    expect(indexAgent).not.toHaveBeenCalled();
    expect(indexAgentsBatch).not.toHaveBeenCalled();
    expect(deleteAgentsBatch).not.toHaveBeenCalled();

    // Introduce an updated agent (with higher updatedAt) and run again.
    subgraph.append({
      id: '11155111:2',
      chainId: '11155111',
      agentId: '2',
      updatedAt: '30',
      registrationFile: {
        name: 'Beta',
        description: 'Agent Beta updated',
        supportedTrusts: [],
        mcpTools: ['tool'],
        mcpPrompts: [],
        mcpResources: [],
        a2aSkills: ['skill'],
      },
    });

    await runner.run();
    expect(indexAgent).toHaveBeenCalledTimes(1);
    expect(indexAgent.mock.calls[0][0].agentId).toBe('11155111:2');

    const savedAfterUpdate = await store.load();
    expect(savedAfterUpdate?.lastUpdatedAt).toBe('30');
  });
});

