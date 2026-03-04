/**
 * Integration tests: SDK with API key and telemetry endpoint.
 * Requires local Supabase + ingest-telemetry running and seed-telemetry-test-user.sql applied.
 *
 * Set in .env: AGENT0_API_KEY, optionally AGENT0_TELEMETRY_ENDPOINT (defaults to prod).
 * Run: npm test -- telemetry-sdk
 * Or: AGENT0_API_KEY=ag0_live_... npm test -- telemetry-sdk
 */

import { SDK } from '../src/index.js';
import {
  CHAIN_ID,
  RPC_URL,
  SUBGRAPH_URL,
  AGENT_ID,
  AGENT0_API_KEY,
  AGENT0_TELEMETRY_ENDPOINT,
  printConfig,
} from './config.js';

const HAS_API_KEY = Boolean(AGENT0_API_KEY && AGENT0_API_KEY.trim() !== '');
const describeMaybe = HAS_API_KEY ? describe : describe.skip;
const itMaybe = HAS_API_KEY ? it : it.skip;

describeMaybe('SDK with telemetry (apiKey + telemetryEndpoint)', () => {
  let sdk: SDK;

  beforeAll(() => {
    printConfig();
    sdk = new SDK({
      chainId: CHAIN_ID,
      rpcUrl: RPC_URL,
      subgraphUrl: SUBGRAPH_URL,
      apiKey: AGENT0_API_KEY,
      telemetryEndpoint: AGENT0_TELEMETRY_ENDPOINT || undefined,
    });
  });

  itMaybe('searchAgents returns array and emits telemetry', async () => {
    const result = await sdk.searchAgents({}, { sort: ['updatedAt:desc'] });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(typeof result[0].chainId).toBe('number');
      expect(typeof result[0].agentId).toBe('string');
      expect(result[0].agentId).toMatch(/^\d+:\d+$/);
    }
  });

  itMaybe('getAgent returns agent or null and emits telemetry', async () => {
    const agent = await sdk.getAgent(AGENT_ID);
    if (agent) {
      expect(agent.agentId).toBe(AGENT_ID);
      expect(typeof agent.chainId).toBe('number');
      expect(typeof agent.name).toBe('string');
    }
  });
});

describe('SDK without apiKey (no telemetry)', () => {
  it('constructs and searchAgents works', async () => {
    const sdk = new SDK({
      chainId: CHAIN_ID,
      rpcUrl: RPC_URL,
      subgraphUrl: SUBGRAPH_URL,
    });
    const result = await sdk.searchAgents({}, { sort: ['updatedAt:desc'] });
    expect(Array.isArray(result)).toBe(true);
  });
});
