/**
 * A2A integration tests: real A2A server + SDK Agent.messageA2A and task methods.
 *
 * Run with: RUN_A2A_INTEGRATION=1 npm test -- --testPathPattern=a2a-integration
 * Or:       npm run test:a2a-integration
 */

import { spawn } from 'child_process';
import type { RegistrationFile, AgentSummary } from '../src/models/interfaces.js';
import { EndpointType, TrustModel } from '../src/models/enums.js';
import { Agent } from '../src/core/agent.js';
import type { SDK } from '../src/core/sdk.js';
import { A2AClientFromSummary } from '../src/core/a2a-summary-client.js';
import type { A2AClient } from '../src/models/a2a.js';

const INTEGRATION_PORT = 4030;
const INTEGRATION_402_PORT = 4031;
const INTEGRATION_402_TASKS_PORT = 4033;
const INTEGRATION_AUTH_PORT = 4032;
const SERVER_PATH = 'tests/a2a-server/server.mjs';
const BASE_URL = `http://localhost:${INTEGRATION_PORT}`;
const BASE_URL_402 = `http://localhost:${INTEGRATION_402_PORT}`;
const BASE_URL_402_TASKS = `http://localhost:${INTEGRATION_402_TASKS_PORT}`;
const BASE_URL_AUTH = `http://localhost:${INTEGRATION_AUTH_PORT}`;
const AUTH_EXPECTED_KEY = 'test-secret';

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

function makeClientFromSummary(
  baseUrl: string,
  buildPayment?: () => Promise<string>
): A2AClient {
  const stubSdk = {
    getX402RequestDeps: () => ({
      fetch: globalThis.fetch,
      buildPayment: buildPayment ?? (async () => {
        throw new Error('402 not expected in this test');
      }),
    }),
  };
  const summary: AgentSummary = {
    chainId: 1,
    agentId: '1:0',
    name: 'Integration Test Agent',
    description: 'Test',
    a2a: baseUrl,
    owners: [],
    operators: [],
    supportedTrusts: [],
    a2aSkills: [],
    mcpTools: [],
    mcpPrompts: [],
    mcpResources: [],
    oasfSkills: [],
    oasfDomains: [],
    active: true,
    x402support: false,
    extras: {},
  };
  return new A2AClientFromSummary(stubSdk, summary);
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

  it('listTasks returns tasks after messageA2A creates one; loadTask returns same handle', async () => {
    const agent = makeAgentWithA2AEndpoint(BASE_URL);
    const result = await agent.messageA2A('create task');

    expect('task' in result).toBe(true);
    if (!('task' in result)) return;
    const { taskId, contextId, task } = result;

    const list = await agent.listTasks();
    expect(Array.isArray(list)).toBe(true);
    const tasks = list as import('../src/models/a2a.js').TaskSummary[];
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const found = tasks.find((t) => t.taskId === taskId);
    expect(found).toBeDefined();
    expect(found!.contextId).toBe(contextId);

    const loaded = await agent.loadTask(taskId);
    expect('x402Required' in loaded).toBe(false);
    if (!('x402Required' in loaded)) {
      expect(loaded.taskId).toBe(taskId);
      expect(loaded.contextId).toBe(contextId);
      const queryResult = await loaded.query();
      expect('x402Required' in queryResult).toBe(false);
      if (!('x402Required' in queryResult)) {
        expect(queryResult.taskId).toBe(taskId);
        expect(queryResult.status).toEqual({ state: 'open' });
      }
    }
  }, 15000);

  it('messageA2A via A2AClientFromSummary (summary.a2a) returns message response', async () => {
    const client = makeClientFromSummary(BASE_URL);
    const result = await client.messageA2A('hello');

    expect('x402Required' in result && result.x402Required).toBe(false);
    expect('task' in result).toBe(false);
    if (!('task' in result) && !('x402Required' in result)) {
      expect(result.content).toContain('Echo: hello');
      expect(result.contextId).toBeDefined();
    }
  }, 10000);

  it('listTasks and loadTask via A2AClientFromSummary work', async () => {
    const client = makeClientFromSummary(BASE_URL);
    const result = await client.messageA2A('create task');

    expect('task' in result).toBe(true);
    if (!('task' in result)) return;
    const { taskId, contextId } = result;

    const list = await client.listTasks();
    expect(Array.isArray(list)).toBe(true);
    const tasks = list as import('../src/models/a2a.js').TaskSummary[];
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const found = tasks.find((t) => t.taskId === taskId);
    expect(found).toBeDefined();
    expect(found!.contextId).toBe(contextId);

    const loaded = await client.loadTask(taskId);
    expect('x402Required' in loaded).toBe(false);
    if (!('x402Required' in loaded)) {
      expect(loaded.taskId).toBe(taskId);
      expect(loaded.contextId).toBe(contextId);
      const queryResult = await loaded.query();
      expect('x402Required' in queryResult).toBe(false);
      if (!('x402Required' in queryResult)) {
        expect(queryResult.taskId).toBe(taskId);
      }
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

  it('messageA2A with options.payment (valid payload): 200 on first request, no 402', async () => {
    const agent = makeAgentWithA2AEndpoint(BASE_URL_402, async () => VALID_PAYLOAD_402);
    const result = await agent.messageA2A('hello', { payment: VALID_PAYLOAD_402 });

    expect('x402Required' in result && result.x402Required).toBe(false);
    expect('task' in result).toBe(false);
    if (!('task' in result) && !('x402Required' in result)) {
      expect(result.content).toContain('Echo: hello');
      expect(result.contextId).toBeDefined();
    }
  }, 10000);

  it('messageA2A via A2AClientFromSummary → 402 → pay() → 200', async () => {
    const client = makeClientFromSummary(BASE_URL_402, async () => VALID_PAYLOAD_402);
    const result = await client.messageA2A('hello');

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

describeIntegration('A2A integration (server with 402 on message and tasks)', () => {
  beforeAll(async () => {
    serverProcess = spawn('node', [SERVER_PATH], {
      env: {
        ...process.env,
        PORT: String(INTEGRATION_402_TASKS_PORT),
        A2A_402: '1',
        A2A_402_TASKS: '1',
        RESPOND_WITH: 'task',
      },
      stdio: 'pipe',
    });
    await waitForServer(BASE_URL_402_TASKS);
  }, 15000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });

  it('messageA2A → 402 → pay() → task, then task.query/cancel and listTasks/loadTask each 402 → pay()', async () => {
    const agent = makeAgentWithA2AEndpoint(BASE_URL_402_TASKS, async () => VALID_PAYLOAD_402);

    // 1. Create task (message:send 402 → pay)
    const sendResult = await agent.messageA2A('create task');
    expect('x402Required' in sendResult && sendResult.x402Required).toBe(true);
    if (!('x402Required' in sendResult) || !sendResult.x402Required) return;
    const paidSend = await sendResult.x402Payment.pay();
    expect('task' in paidSend).toBe(true);
    if (!('task' in paidSend)) return;
    const { taskId, contextId, task } = paidSend;

    // 2. task.query() → 402 → pay()
    const queryResult = await task.query({ historyLength: 5 });
    expect('x402Required' in queryResult && queryResult.x402Required).toBe(true);
    if (!('x402Required' in queryResult) || !queryResult.x402Required) return;
    const paidQuery = await queryResult.x402Payment.pay();
    expect('x402Required' in paidQuery).toBe(false);
    if (!('x402Required' in paidQuery)) {
      expect(paidQuery.taskId).toBe(taskId);
      expect(paidQuery.status).toEqual({ state: 'open' });
    }

    // 3. listTasks() → 402 → pay()
    const listResult = await agent.listTasks();
    expect('x402Required' in listResult && listResult.x402Required).toBe(true);
    if (!('x402Required' in listResult) || !listResult.x402Required) return;
    const paidList = await listResult.x402Payment.pay();
    expect(Array.isArray(paidList)).toBe(true);
    const list = paidList as import('../src/models/a2a.js').TaskSummary[];
    expect(list.some((t) => t.taskId === taskId)).toBe(true);

    // 4. loadTask(taskId) → 402 → pay()
    const loadResult = await agent.loadTask(taskId);
    expect('x402Required' in loadResult && loadResult.x402Required).toBe(true);
    if (!('x402Required' in loadResult) || !loadResult.x402Required) return;
    const paidLoad = await loadResult.x402Payment.pay();
    expect('x402Required' in paidLoad).toBe(false);
    expect(paidLoad.taskId).toBe(taskId);
    expect(paidLoad.contextId).toBe(contextId);
    const loadedQuery = await paidLoad.query();
    expect('x402Required' in loadedQuery && loadedQuery.x402Required).toBe(true);
    if (!('x402Required' in loadedQuery) || !loadedQuery.x402Required) return;
    const paidLoadedQuery = await loadedQuery.x402Payment.pay();
    expect(paidLoadedQuery.taskId).toBe(taskId);

    // 5. task.cancel() → 402 → pay()
    const cancelResult = await task.cancel();
    expect('x402Required' in cancelResult && cancelResult.x402Required).toBe(true);
    if (!('x402Required' in cancelResult) || !cancelResult.x402Required) return;
    const paidCancel = await cancelResult.x402Payment.pay();
    expect('x402Required' in paidCancel).toBe(false);
    if (!('x402Required' in paidCancel)) {
      expect(paidCancel.taskId).toBe(taskId);
      expect(paidCancel.status).toEqual({ state: 'canceled' });
    }
  }, 25000);

  it('A2AClientFromSummary: messageA2A → 402 → pay() → task, then listTasks/loadTask 402 → pay()', async () => {
    const client = makeClientFromSummary(BASE_URL_402_TASKS, async () => VALID_PAYLOAD_402);

    const sendResult = await client.messageA2A('create task');
    expect('x402Required' in sendResult && sendResult.x402Required).toBe(true);
    if (!('x402Required' in sendResult) || !sendResult.x402Required) return;
    const paidSend = await sendResult.x402Payment.pay();
    expect('task' in paidSend).toBe(true);
    if (!('task' in paidSend)) return;
    const { taskId, contextId } = paidSend;

    const listResult = await client.listTasks();
    expect('x402Required' in listResult && listResult.x402Required).toBe(true);
    if (!('x402Required' in listResult) || !listResult.x402Required) return;
    const paidList = await listResult.x402Payment.pay();
    expect(Array.isArray(paidList)).toBe(true);
    expect((paidList as import('../src/models/a2a.js').TaskSummary[]).some((t) => t.taskId === taskId)).toBe(true);

    const loadResult = await client.loadTask(taskId);
    expect('x402Required' in loadResult && loadResult.x402Required).toBe(true);
    if (!('x402Required' in loadResult) || !loadResult.x402Required) return;
    const paidLoad = await loadResult.x402Payment.pay();
    expect('x402Required' in paidLoad).toBe(false);
    expect(paidLoad.taskId).toBe(taskId);
    expect(paidLoad.contextId).toBe(contextId);
  }, 25000);
});

describeIntegration('A2A integration (server with auth)', () => {
  let authServerProcess: ReturnType<typeof spawn> | null = null;

  beforeAll(async () => {
    authServerProcess = spawn('node', [SERVER_PATH], {
      env: {
        ...process.env,
        PORT: String(INTEGRATION_AUTH_PORT),
        A2A_AUTH: '1',
        A2A_EXPECTED_KEY: AUTH_EXPECTED_KEY,
      },
      stdio: 'pipe',
    });
    await waitForServer(BASE_URL_AUTH);
  }, 15000);

  afterAll(() => {
    if (authServerProcess) {
      authServerProcess.kill();
      authServerProcess = null;
    }
  });

  it('setA2A fetches agent card with securitySchemes, messageA2A with credential succeeds', async () => {
    const regFile: RegistrationFile = {
      name: 'Auth Test Agent',
      description: 'Test',
      endpoints: [],
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
        buildPayment: async () => {
          throw new Error('402 not expected');
        },
      }),
    } as unknown as SDK;
    const agent = new Agent(stubSdk, regFile);
    await agent.setA2A(BASE_URL_AUTH, '0.3', true);

    const result = await agent.messageA2A('hello', { credential: AUTH_EXPECTED_KEY });

    expect('x402Required' in result && result.x402Required).toBe(false);
    expect('task' in result).toBe(false);
    if (!('task' in result) && !('x402Required' in result)) {
      expect(result.content).toContain('Echo: hello');
      expect(result.contextId).toBeDefined();
    }
  }, 10000);

  it('messageA2A without credential fails with 401 when server requires auth', async () => {
    const agent = makeAgentWithA2AEndpoint(BASE_URL_AUTH);
    (agent as any).registrationFile.endpoints[0].meta = {
      version: '0.3',
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      security: [{ apiKey: [] }],
    };

    await expect(agent.messageA2A('hello')).rejects.toThrow(/401/);
  }, 10000);

  it('messageA2A with credential via A2AClientFromSummary succeeds when card has securitySchemes', async () => {
    const client = makeClientFromSummary(BASE_URL_AUTH);
    const result = await client.messageA2A('hello', { credential: AUTH_EXPECTED_KEY });

    expect('x402Required' in result && result.x402Required).toBe(false);
    expect('task' in result).toBe(false);
    if (!('task' in result) && !('x402Required' in result)) {
      expect(result.content).toContain('Echo: hello');
      expect(result.contextId).toBeDefined();
    }
  }, 10000);
});
