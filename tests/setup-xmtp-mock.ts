/**
 * Mock @xmtp/node-sdk so Jest can load the SDK in tests that don't use real XMTP.
 * The package is ESM-only and uses import.meta + native bindings; transforming it
 * for Jest is fragile, so we mock by default. Tests that need a richer mock
 * (e.g. xmtp-client.test.ts) define their own jest.mock in the test file.
 */
jest.mock('@xmtp/node-sdk', () => ({
  Client: {
    build: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    fetchInboxStates: jest.fn().mockResolvedValue([]),
  },
  isText: (m: { content?: unknown }) => typeof m?.content === 'string',
}));
