/**
 * Node.js-specific file system loader
 * 
 * This module provides a way to dynamically load the Node.js 'fs' module
 * in a way that prevents bundlers from statically analyzing the import.
 * 
 * This module should only be imported in Node.js environments.
 */

export async function loadNodeFS(): Promise<typeof import('node:fs')> {
  // Runtime check to ensure we're in Node.js
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error('Node.js fs module is only available in Node.js environments');
  }

  // Use node: prefix (modern Node.js style)
  // The dynamic import with 'node:' prefix is cleaner than 'fs'
  // but bundlers may still try to analyze it - that's why this is in a separate module
  return await import('node:fs');
}
