/**
 * x402-types unit tests: parse402AcceptsFromHeader (PAYMENT-REQUIRED header only; x402 spec).
 * Imports only from x402-types to avoid pulling in the full SDK.
 */

import {
  parse402AcceptsFromHeader,
  parse402FromHeader,
  parse402FromBody,
  parse402SettlementFromHeader,
} from '../src/core/x402-types.js';

describe('parse402AcceptsFromHeader', () => {
  it('parses base64 PAYMENT-REQUIRED header with accepts', () => {
    const payload = {
      x402Version: 2,
      error: 'Payment required',
      accepts: [
        { scheme: 'exact', network: 'eip155:8453', amount: '1000', asset: '0x83...', payTo: '0xf89...' },
      ],
    };
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const out = parse402AcceptsFromHeader(b64);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      price: '1000',
      token: '0x83...',
      destination: '0xf89...',
      network: 'eip155:8453',
      scheme: 'exact',
    });
  });

  it('returns [] for null or empty string', () => {
    expect(parse402AcceptsFromHeader(null)).toEqual([]);
    expect(parse402AcceptsFromHeader('')).toEqual([]);
  });

  it('returns [] for invalid base64 or non-JSON', () => {
    expect(parse402AcceptsFromHeader('not-valid-base64!!!')).toEqual([]);
    expect(parse402AcceptsFromHeader(Buffer.from('{}', 'utf8').toString('base64'))).toEqual([]); // no accepts
  });
});

describe('parse402FromHeader', () => {
  it('returns resource and error when present (v2 style)', () => {
    const payload = {
      x402Version: 2,
      error: 'PAYMENT-SIGNATURE header is required',
      resource: { url: 'https://api.example.com/res', description: 'Premium API', mimeType: 'application/json' },
      accepts: [{ scheme: 'exact', network: 'eip155:84532', amount: '1000', asset: '0xAsset', payTo: '0xPayTo' }],
    };
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const out = parse402FromHeader(b64);
    expect(out.accepts).toHaveLength(1);
    expect(out.x402Version).toBe(2);
    expect(out.error).toBe('PAYMENT-SIGNATURE header is required');
    expect(out.resource).toEqual({ url: 'https://api.example.com/res', description: 'Premium API', mimeType: 'application/json' });
  });

  it('returns undefined resource when resource has no url', () => {
    const payload = { x402Version: 2, accepts: [], resource: { description: 'only' } };
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const out = parse402FromHeader(b64);
    expect(out.resource).toBeUndefined();
  });
});

describe('parse402FromBody', () => {
  it('returns resource and error when present', () => {
    const body = JSON.stringify({
      x402Version: 1,
      error: 'X-PAYMENT header is required',
      accepts: [{ maxAmountRequired: '500', asset: '0xA', payTo: '0xB' }],
    });
    const out = parse402FromBody(body);
    expect(out.accepts).toHaveLength(1);
    expect(out.error).toBe('X-PAYMENT header is required');
  });
});

describe('parse402SettlementFromHeader', () => {
  it('parses base64 PAYMENT-RESPONSE with success, transaction, network, payer', () => {
    const payload = {
      success: true,
      transaction: '0xabc',
      network: 'eip155:84532',
      payer: '0xPayer',
    };
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const out = parse402SettlementFromHeader(b64);
    expect(out).toEqual({ success: true, transaction: '0xabc', network: 'eip155:84532', payer: '0xPayer' });
  });

  it('returns undefined for null or invalid input', () => {
    expect(parse402SettlementFromHeader(null)).toBeUndefined();
    expect(parse402SettlementFromHeader('')).toBeUndefined();
    expect(parse402SettlementFromHeader('not-base64!!!')).toBeUndefined();
  });
});
