/**
 * x402 integration tests: real server + SDK request flow.
 * Start the x402 test server, then run requestWithX402 (with mock buildPayment) against it.
 *
 * Run with: RUN_X402_INTEGRATION=1 npm test -- --testPathPattern=x402-integration
 * Or:       npm run test:x402-integration  (if added to package.json)
 */

import { spawn } from 'child_process';
import { requestWithX402 } from '../src/core/x402-request.js';

const INTEGRATION_PORT = 4022;
const SERVER_PATH = 'tests/x402-server/server.mjs';
const BASE_URL = `http://localhost:${INTEGRATION_PORT}`;

let serverProcess: ReturnType<typeof spawn> | null = null;

async function waitForServer(url: string, maxAttempts = 20): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 402 || res.status === 200) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not become ready');
}

const runIntegration = process.env.RUN_X402_INTEGRATION === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('x402 integration (server)', () => {
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

  const parseResponse = (r: Response) => r.json() as Promise<{ success?: boolean; data?: string }>;

  it('single accept: request → 402, then pay() → 200', async () => {
    const validPayload = Buffer.from(
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

    const buildPayment = async () => validPayload;

    const result = await requestWithX402(
      { url: BASE_URL, method: 'GET', parseResponse },
      { fetch: globalThis.fetch, buildPayment }
    );

    expect('x402Required' in result && result.x402Required).toBe(true);
    if (!('x402Required' in result) || !result.x402Required) return;

    const paid = await result.x402Payment.pay();
    expect(paid).toMatchObject({ success: true, data: 'resource' });
  }, 10000);

  it('payment with first request: 200 in one round trip', async () => {
    const validPayload = Buffer.from(
      JSON.stringify({
        x402Version: 1,
        scheme: 'exact',
        network: '84532',
        payload: {
          signature: '0x' + 'c'.repeat(130),
          authorization: {
            from: '0x1234567890123456789012345678901234567890',
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            value: '1000000',
            validAfter: '0',
            validBefore: String(Math.floor(Date.now() / 1000) + 3600),
            nonce: '0x' + 'd'.repeat(64),
          },
        },
      })
    ).toString('base64');

    const result = await requestWithX402(
      { url: BASE_URL, method: 'GET', payment: validPayload, parseResponse },
      { fetch: globalThis.fetch, buildPayment: async () => 'never-called' }
    );

    expect('x402Required' in result && result.x402Required).toBe(false);
    expect(result).toMatchObject({ success: true, data: 'resource' });
  }, 10000);

  it('invalid PAYMENT-SIGNATURE on retry: server returns 402 again, pay() rejects', async () => {
    const buildPayment = async () =>
      Buffer.from(JSON.stringify({ invalid: true })).toString('base64');

    const result = await requestWithX402(
      { url: BASE_URL, method: 'GET', parseResponse },
      { fetch: globalThis.fetch, buildPayment }
    );

    expect('x402Required' in result && result.x402Required).toBe(true);
    if (!('x402Required' in result) || !result.x402Required) return;

    await expect(result.x402Payment.pay()).rejects.toThrow();
  }, 10000);
});
