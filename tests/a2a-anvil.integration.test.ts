/**
 * A2A integration tests with real chain (Foundry anvil) and EIP-3009-style token.
 * Starts anvil, deploys mock token, starts A2A server with 402 mode, then
 * agent.messageA2A → 402 → pay() with real buildEvmPayment.
 *
 * Requires: Foundry on PATH (forge, anvil). Install: foundryup
 *
 * Run with: RUN_A2A_ANVIL=1 npm test -- --testPathPattern=a2a-anvil
 * Or:       npm run test:a2a-anvil
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { SDK } from '../src/index.js';
import type { AgentSummary } from '../src/models/interfaces.js';

const ANVIL_PORT = 8546;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const CHAIN_ID = 31337;
const A2A_SERVER_PORT = 4032;
const A2A_SERVER_PATH = 'tests/a2a-server/server.mjs';
const DEPLOY_RESULT_PATH = join(process.cwd(), 'tests', '.x402-deploy-result.json');

const ANVIL_ACCOUNT_0_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

let anvilProcess: ReturnType<typeof spawn> | null = null;
let serverProcess: ReturnType<typeof spawn> | null = null;

async function waitForRpc(url: string, maxAttempts = 50): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
      });
      const data = (await res.json()) as { result?: string };
      if (data.result) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Anvil RPC did not become ready');
}

async function waitForServer(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 402) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('A2A server did not become ready');
}

function runForgeBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('forge', ['build'], { cwd: process.cwd(), stdio: 'pipe' });
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`forge build failed (${code}): ${stderr}`));
    });
    child.on('error', (e) => reject(new Error(`forge not found: ${e.message}. Install Foundry: foundryup`)));
  });
}

function runDeploy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/deploy-x402-mock.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, RPC_URL, DEPLOY_RESULT_PATH },
      stdio: 'pipe',
    });
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Deploy failed (${code}): ${stderr}`));
    });
    child.on('error', reject);
  });
}

interface DeployResult {
  token: string;
  tokens?: string[];
  payTo: string;
  chainId: number;
  mintAmount: string;
}

function readDeployResult(): DeployResult {
  const raw = readFileSync(DEPLOY_RESULT_PATH, 'utf8');
  return JSON.parse(raw) as DeployResult;
}

const runAnvil = process.env.RUN_A2A_ANVIL === '1';
const describeAnvil = runAnvil ? describe : describe.skip;

describeAnvil('A2A Anvil integration (real chain + A2A 402 + pay())', () => {
  let baseUrl: string;

  beforeAll(async () => {
    anvilProcess = spawn('anvil', ['--port', String(ANVIL_PORT)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
    });
    await waitForRpc(RPC_URL);

    const outDir = join(process.cwd(), 'out', 'MockEIP3009.sol', 'MockEIP3009.json');
    if (!existsSync(outDir)) await runForgeBuild();
    await runDeploy();

    const deploy = readDeployResult();
    const tokenAddresses = deploy.tokens ?? [deploy.token];
    const accepts = tokenAddresses.map((token) => ({
      price: '1000000',
      token,
      network: String(deploy.chainId),
      scheme: 'exact' as const,
      destination: deploy.payTo,
    }));

    baseUrl = `http://localhost:${A2A_SERVER_PORT}`;
    serverProcess = spawn('node', [A2A_SERVER_PATH], {
      env: {
        ...process.env,
        PORT: String(A2A_SERVER_PORT),
        A2A_402: '1',
        ACCEPTS_JSON: JSON.stringify(accepts),
      },
      stdio: 'pipe',
    });
    await waitForServer(baseUrl);
  }, 90000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
    if (anvilProcess) {
      anvilProcess.kill();
      anvilProcess = null;
    }
  });

  it('messageA2A → 402, then pay() with real buildEvmPayment → 200', async () => {
    const sdk = new SDK({
      chainId: CHAIN_ID,
      rpcUrl: RPC_URL,
      privateKey: ANVIL_ACCOUNT_0_PRIVATE_KEY,
    });

    const agent = await sdk.createAgent('Test Agent', 'Test').setA2A(baseUrl, '0.3', false);
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
  }, 20000);

  it('messageA2A("create task") → 402 → pay() → task, then task.query/message/cancel (real chain)', async () => {
    const sdk = new SDK({
      chainId: CHAIN_ID,
      rpcUrl: RPC_URL,
      privateKey: ANVIL_ACCOUNT_0_PRIVATE_KEY,
    });

    const agent = await sdk.createAgent('Test Agent', 'Test').setA2A(baseUrl, '0.3', false);
    const result = await agent.messageA2A('create task');

    expect('x402Required' in result && result.x402Required).toBe(true);
    if (!('x402Required' in result) || !result.x402Required) return;

    const paid = await result.x402Payment.pay();
    expect('x402Required' in paid).toBe(false);
    expect('task' in paid).toBe(true);
    if (!('task' in paid)) return;

    const { taskId, task } = paid;
    expect(taskId).toBeDefined();
    expect(task.contextId).toBeDefined();

    const queryResult = await task.query({ historyLength: 5 });
    expect('x402Required' in queryResult).toBe(false);
    if (!('x402Required' in queryResult)) {
      expect(queryResult.taskId).toBe(taskId);
      expect(queryResult.status).toEqual({ state: 'open' });
    }

    const msgResult = await task.message('follow up');
    const paidMsg =
      'x402Required' in msgResult && msgResult.x402Required
        ? await msgResult.x402Payment.pay()
        : msgResult;
    expect('x402Required' in paidMsg).toBe(false);
    expect('task' in paidMsg).toBe(false);
    if (!('x402Required' in paidMsg) && !('task' in paidMsg)) {
      expect(paidMsg.content).toContain('Echo: follow up');
    }

    const cancelResult = await task.cancel();
    expect('x402Required' in cancelResult).toBe(false);
    if (!('x402Required' in cancelResult)) {
      expect(cancelResult.taskId).toBe(taskId);
      expect(cancelResult.status).toEqual({ state: 'canceled' });
    }
  }, 25000);

  it('createA2AClient(summary) messageA2A → 402 → pay() with real buildEvmPayment → 200', async () => {
    const sdk = new SDK({
      chainId: CHAIN_ID,
      rpcUrl: RPC_URL,
      privateKey: ANVIL_ACCOUNT_0_PRIVATE_KEY,
    });

    const summary: AgentSummary = {
      chainId: CHAIN_ID,
      agentId: `${CHAIN_ID}:0`,
      name: 'Test Agent',
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
    const client = sdk.createA2AClient(summary);
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
  }, 20000);
});
