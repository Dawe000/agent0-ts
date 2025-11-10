import type { SemanticAgentRecord } from './types.js';

/**
 * Persisted sync state used to resume semantic indexing without reprocessing all agents.
 */
export interface SemanticSyncState {
  /**
   * Highest subgraph `updatedAt` value (as stringified bigint) that has been processed.
   */
  lastUpdatedAt: string;
  /**
   * Optional hash map used to detect agent changes and avoid redundant upserts.
   */
  agentHashes?: Record<string, string>;
}

/**
 * Abstraction for persisting semantic sync state.
 * Implementations can back this by the file system, databases, or in-memory stores.
 */
export interface SemanticSyncStateStore {
  load(): Promise<SemanticSyncState | null>;
  save(state: SemanticSyncState): Promise<void>;
  clear?(): Promise<void>;
}

/**
 * Default in-memory store (non-persistent). Useful for quick starts and tests.
 */
export class InMemorySemanticSyncStateStore implements SemanticSyncStateStore {
  private state: SemanticSyncState | null = null;

  async load(): Promise<SemanticSyncState | null> {
    return this.state ? { ...this.state, agentHashes: { ...(this.state.agentHashes ?? {}) } } : null;
  }

  async save(state: SemanticSyncState): Promise<void> {
    this.state = {
      lastUpdatedAt: state.lastUpdatedAt,
      agentHashes: state.agentHashes ? { ...state.agentHashes } : undefined,
    };
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}

/**
 * Helper to compute a deterministic hash for a semantic agent record.
 * Consumers can use this to implement custom stores without re-exporting crypto utilities.
 */
export function computeAgentHash(agent: SemanticAgentRecord): string {
  // Use structured data to avoid property order issues.
  const canonical = JSON.stringify(agent, Object.keys(agent).sort());
  // Small, dependency-free hashing (FNV-1a 32-bit)
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

