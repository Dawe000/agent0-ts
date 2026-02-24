/**
 * A2A integration tests: real A2A server + SDK Agent.messageA2A and task methods.
 *
 * Run with: RUN_A2A_INTEGRATION=1 npm test -- --testPathPattern=a2a-integration
 * Or:       npm run test:a2a-integration
 */

import { spawn } from 'child_process';
import type { RegistrationFile } from '../src/models/interfaces.js';
import { EndpointType, TrustModel } from '../src/models/enums.js';
import { Agent } from '../src/core/agent.js';
import type { SDK } from '../src/core/sdk.js';

const INTEGRATION_PORT = 4030;
const INTEGRATION_402_PORT = 4031;
const SERVER_PATH = 'tests/a2a-server/server.mjs';
const BASE_URL = `http://localhost:${INTEGRATION_PORT}`;
const BASE_URL_402 = `http://localhost:${INTEGRATION_402_PORT}`;

let serverProcess: ReturnType<typeof spawn> | null = null;

async function waitForServer(url: string, maxAttempts = 25): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('A2A server did not become ready');
}

const VALID_PAYLOAD_402 = Buffer.from(
  JSON.stringify({
    x402Version: 1,
    scheme: 'exact',
    network: '84532',
    payload: {
      signature: '0x' + 'a'.repeat(130),
      authorization: {
        from: '0x1234567890123456789012345678901234567890',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        value: '1000000',
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + 3600),
        nonce: '0x' + 'b'.repeat(64),
      },
    },
  })
).toString('base64');

function makeAgentWithA2AEndpoint(baseUrl: string, buildPayment?: () => Promise<string>): Agent {
  const regFile: RegistrationFile = {
    name: 'Integration Test Agent',
    description: 'Test',
    endpoints: [
      { type: EndpointType.A2A, value: baseUrl, meta: { version: '0.3' } },
    ],
    trustModels: [TrustModel.REPUTATION],
    owners: [],
    operators: [],
    active: true,
    x402support: false,
    metadata: {},
    updatedAt: 0,
  };
  const stubSdk = {
    getX402RequestDeps: () => ({
      fetch: globalThis.fetch,
      buildPayment: buildPayment ?? (async () => {
        throw new Error('402 not expected in this test');
      }),
    }),
  } as unknown as SDK;
  return new Agent(stubSdk, regFile);
}

const runIntegration = process.env.RUN_A2A_INTEGRATION === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('A2A integration (server)', () => {
  beforeAll(async () => {
    serverProcess = spawn('node', [SERVER_PATH], {
      env: { ...process.env, PORT: String(INTEGRATION_PORT) },
      stdio: 'pipe',
    });
    await waitForServer(BASE_URL);
  }, 15000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });

  it('messageA2A returns message response (echo)', async () => {
    const agent = makeAgentWithA2AEndpoint(BASE_URL);
    const result = await agent.messageA2A('hello');

    expect('x402Required' in result && result.x402Required).toBe(false);
    expect('task' in result).toBe(false);
    if (!('task' in result) && !('x402Required' in result)) {
      expect(result.content).toContain('Echo: hello');
      expect(result.contextId).toBeDefined();
    }
  }, 10000);

  it('messageA2A with "task" in text returns task, then query/message/cancel work', async () => {
    const agent = makeAgentWithA2AEndpoint(BASE_URL);
    const result = await agent.messageA2A('create task');

    expect('x402Required' in result && result.x402Required).toBe(false);
    expect('task' in result).toBe(true);
    if (!('task' in result)) return;

    const { task } = result;
    expect(task.taskId).toBeDefined();
    expect(task.contextId).toBeDefined();

    const queryResult = await task.query({ historyLength: 5 });
    expect('x402Required' in queryResult).toBe(false);
    if (!('x402Required' in queryResult)) {
      expect(queryResult.taskId).toBe(task.taskId);
      expect(queryResult.status).toEqual({ state: 'open' });
    }

    const msgResult = await task.message('follow up');
    expect('x402Required' in msgResult).toBe(false);
    expect('task' in msgResult).toBe(false);
    if (!('x402Required' in msgResult) && !('task' in msgResult)) {
      expect(msgResult.content).toContain('Echo: follow up');
    }

    const cancelResult = await task.cancel();
    expect('x402Required' in cancelResult).toBe(false);
    if (!('x402Required' in cancelResult)) {
      expect(cancelResult.taskId).toBe(task.taskId);
      expect(cancelResult.status).toEqual({ state: 'canceled' });
    }
  }, 15000);
});

describeIntegration('A2A integration (server with 402)', () => {
  beforeAll(async () => {
    serverProcess = spawn('node', [SERVER_PATH], {
      env: {
        ...process.env,
        PORT: String(INTEGRATION_402_PORT),
        A2A_402: '1',
      },
      stdio: 'pipe',
    });
    await waitForServer(BASE_URL_402);
  }, 15000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });

  it('messageA2A → 402, then pay() with mock buildPayment → 200', async () => {
    const agent = makeAgentWithA2AEndpoint(BASE_URL_402, async () => VALID_PAYLOAD_402);
    const result = await agent.messageA2A('hello');

    expect('x402Required' in result && result.x402Required).toBe(true);
    if (!('x402Required' in result) || !result.x402Required) return;

    const paid = await result.x402Payment.pay();
    expect('x402Required' in paid).toBe(false);
    expect('task' in paid).toBe(false);
    if (!('task' in paid)) {
      expect(paid.content).toContain('Echo: hello');
      expect(paid.contextId).toBeDefined();
    }
  }, 10000);
});
