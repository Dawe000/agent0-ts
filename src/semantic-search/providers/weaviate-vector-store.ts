import { createHash } from 'crypto';
import type { SemanticSearchFilters } from '../types.js';
import type {
  VectorStoreProvider,
  VectorUpsertItem,
  VectorQueryParams,
  VectorQueryMatch,
} from '../interfaces.js';

export interface WeaviateVectorStoreConfig {
  endpoint: string;
  apiKey?: string;
  className?: string;
  tenant?: string;
  consistencyLevel?: 'ALL' | 'ONE' | 'QUORUM';
  batchSize?: number;
}

interface WeaviateGraphQLResponse {
  data?: {
    Get?: Record<string, Array<{
      _additional?: {
        id?: string;
        vector?: number[];
        distance?: number;
        certainty?: number;
        score?: number;
      };
      [key: string]: unknown;
    }>>;
  };
}

export class WeaviateVectorStore implements VectorStoreProvider {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly className: string;
  private readonly tenant?: string;
  private readonly consistencyLevel?: 'ALL' | 'ONE' | 'QUORUM';
  private readonly batchSize: number;

  constructor(config: WeaviateVectorStoreConfig) {
    if (!config?.endpoint) {
      throw new Error('WeaviateVectorStore requires an endpoint');
    }

    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.className = config.className ?? 'Agent';
    this.tenant = config.tenant;
    this.consistencyLevel = config.consistencyLevel;
    this.batchSize = config.batchSize ?? 100;
  }

  async upsert(item: VectorUpsertItem): Promise<void> {
    await this.upsertBatch([item]);
  }

  async upsertBatch(items: VectorUpsertItem[]): Promise<void> {
    const batches = this.chunk(items, this.batchSize);

    for (const batch of batches) {
      const objects = batch.map(record => ({
        id: this.toUUID(record.id),
        class: this.className,
        vector: record.values,
        properties: {
          ...record.metadata,
          originalId: record.id, // Store original ID in metadata for lookup
        },
        ...(this.tenant ? { tenant: this.tenant } : {}),
      }));

      await this.restCall('/batch/objects', {
        method: 'POST',
        body: JSON.stringify({ objects }),
      });
    }
  }

  async query(params: VectorQueryParams): Promise<VectorQueryMatch[]> {
    const topK = params.topK ?? 5;
    const whereClause = this.buildWhereClause(params.filter);
    
    // In Weaviate, properties are stored directly on the object
    // We select common metadata fields that are typically stored
    const query = `
      {
        Get {
          ${this.className}(
            nearVector: { vector: ${JSON.stringify(params.vector)} }
            limit: ${topK}
            ${whereClause ? `where: ${whereClause}` : ''}
            ${this.tenant ? `tenant: "${this.tenant}"` : ''}
          ) {
            _additional {
              id
              vector
              distance
              certainty
              score
            }
            name
            description
            capabilities
            defaultInputModes
            defaultOutputModes
            tags
            chainId
            agentId
            updatedAt
            originalId
          }
        }
      }
    `;

    const response = await this.graphql(query);
    const data = response.data?.Get?.[this.className] ?? [];

    const results = data.map((item, index) => {
      const additional = item._additional ?? {};
      // Extract all properties except _additional as metadata
      // In Weaviate, properties stored via "properties" become direct fields on the object
      const metadata: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item)) {
        if (key !== '_additional' && value !== undefined) {
          metadata[key] = value;
        }
      }
      
      // Use originalId from metadata if available, otherwise use the UUID
      const originalId = (metadata.originalId as string) ?? additional.id ?? '';
      
      // Convert score/certainty to number (Weaviate may return strings)
      const scoreValue = additional.score ?? additional.certainty ?? 0;
      const score = typeof scoreValue === 'number' ? scoreValue : typeof scoreValue === 'string' ? parseFloat(scoreValue) : 0;
      
      return {
        id: originalId,
        score,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        matchReasons: [
          additional.distance !== undefined ? `distance: ${additional.distance}` : undefined,
          additional.certainty !== undefined ? `certainty: ${additional.certainty}` : undefined,
        ].filter(Boolean) as string[],
        rank: index + 1,
      };
    });

    // Apply minScore filter if specified (post-query filtering)
    if (params.filter?.minScore !== undefined) {
      return results.filter(result => result.score >= params.filter!.minScore!);
    }

    return results;
  }

  async delete(id: string): Promise<void> {
    // Convert to UUID for Weaviate
    const uuid = this.toUUID(id);
    const path = `/objects/${this.className}/${encodeURIComponent(uuid)}`;
    await this.restCall(path, {
      method: 'DELETE',
    });
  }

  async deleteMany(ids: string[]): Promise<void> {
    // Weaviate batch delete: delete objects by their UUIDs
    const batches = this.chunk(ids, this.batchSize);
    for (const batch of batches) {
      // Convert IDs to UUIDs and delete individually in batch
      const deletePromises = batch.map(id => {
        const uuid = this.toUUID(id);
        return this.restCall(`/objects/${this.className}/${encodeURIComponent(uuid)}`, {
          method: 'DELETE',
        });
      });
      await Promise.all(deletePromises);
    }
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  private async graphql(query: string): Promise<WeaviateGraphQLResponse> {
    const response = await fetch(`${this.endpoint}/v1/graphql`, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Weaviate GraphQL query failed: ${response.status} ${errorText}`);
    }

    return (await response.json()) as WeaviateGraphQLResponse;
  }

  private async restCall(path: string, init: RequestInit): Promise<void> {
    const response = await fetch(`${this.endpoint}/v1${path}`, {
      ...init,
      headers: {
        ...this.buildHeaders(),
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Weaviate REST call failed: ${response.status} ${errorText}`);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (this.consistencyLevel) {
      headers['X-Weaviate-Consistency-Level'] = this.consistencyLevel;
    }
    return headers;
  }

  private buildWhereClause(filters?: SemanticSearchFilters): string | undefined {
    if (!filters) return undefined;

    const conditions: string[] = [];

    // Handle capabilities array filter
    // Metadata is stored as direct properties, so path is just ["capabilities"]
    if (filters.capabilities && filters.capabilities.length > 0) {
      if (filters.capabilities.length === 1) {
        conditions.push(`{
          path: ["capabilities"]
          operator: ContainsAny
          valueText: "${filters.capabilities[0]}"
        }`);
      } else {
        const valueTexts = filters.capabilities.map(cap => `"${cap}"`).join(', ');
        conditions.push(`{
          path: ["capabilities"]
          operator: ContainsAny
          valueText: [${valueTexts}]
        }`);
      }
    }

    // Handle inputMode filter (checks if defaultInputModes array contains the value)
    if (filters.inputMode) {
      conditions.push(`{
        path: ["defaultInputModes"]
        operator: ContainsAny
        valueText: "${filters.inputMode}"
      }`);
    }

    // Handle outputMode filter (checks if defaultOutputModes array contains the value)
    if (filters.outputMode) {
      conditions.push(`{
        path: ["defaultOutputModes"]
        operator: ContainsAny
        valueText: "${filters.outputMode}"
      }`);
    }

    // Handle arbitrary metadata filters (excluding minScore which is handled post-query)
    for (const [key, value] of Object.entries(filters)) {
      if (key === 'capabilities' || key === 'inputMode' || key === 'outputMode' || key === 'minScore') {
        continue;
      }

      if (value === null || value === undefined) {
        continue;
      }

      // Handle different value types
      if (typeof value === 'string') {
        conditions.push(`{
          path: ["${key}"]
          operator: Equal
          valueText: "${value}"
        }`);
      } else if (typeof value === 'number') {
        conditions.push(`{
          path: ["${key}"]
          operator: Equal
          valueNumber: ${value}
        }`);
      } else if (typeof value === 'boolean') {
        conditions.push(`{
          path: ["${key}"]
          operator: Equal
          valueBoolean: ${value}
        }`);
      } else if (Array.isArray(value) && value.length > 0) {
        // For arrays, check if any value in the metadata array matches
        const valueTexts = value.map(v => `"${v}"`).join(', ');
        conditions.push(`{
          path: ["${key}"]
          operator: ContainsAny
          valueText: [${valueTexts}]
        }`);
      }
    }

    if (conditions.length === 0) {
      return undefined;
    }

    // If multiple conditions, combine with And operator
    if (conditions.length === 1) {
      return conditions[0];
    }

    return `{
      operator: And
      operands: [${conditions.join(', ')}]
    }`;
  }

  /**
   * Convert a custom ID string to a deterministic UUID v5 format
   * Weaviate requires UUIDs, so we hash the original ID and format it as a UUID
   */
  private toUUID(id: string): string {
    // Create a deterministic UUID from the ID string
    // Using SHA-256 hash and formatting as UUID v4-like string
    const hash = createHash('sha256').update(id).digest('hex');
    // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16), // Version 4
      ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20), // Variant bits
      hash.substring(20, 32),
    ].join('-');
  }

  private transformFilters(filters?: SemanticSearchFilters): Record<string, unknown> | undefined {
    if (!filters) return undefined;
    return filters;
  }
}

