/**
 * Jest setup file for Agent0 SDK tests.
 * Configures logging and test environment.
 */

// Configure console logging for tests
// Note: In Jest, console methods work by default, but we can suppress noise if needed

// Set test timeout for integration tests (2 minutes for blockchain operations)
if (typeof jest !== 'undefined') {
  jest.setTimeout(300000);
}

// Global test setup (runs before all tests)
beforeAll(async () => {
  // Verify environment variables are set
  if (!process.env.AGENT_PRIVATE_KEY && process.env.NODE_ENV !== 'test') {
    console.warn('⚠️  AGENT_PRIVATE_KEY not set. Some tests may fail.');
  }
  if (!process.env.PINATA_JWT && process.env.NODE_ENV !== 'test') {
    console.warn('⚠️  PINATA_JWT not set. IPFS tests may fail.');
  }
});

// Global test teardown (runs after all tests)
afterAll(async () => {
  // Cleanup if needed
});

// Suppress console errors for known issues (optional)
// Uncomment if needed:
// const originalError = console.error;
// beforeAll(() => {
//   console.error = (...args: any[]) => {
//     if (
//       typeof args[0] === 'string' &&
//       args[0].includes('known warning message')
//     ) {
//       return;
//     }
//     originalError(...args);
//   };
// });

// afterAll(() => {
//   console.error = originalError;
// });

