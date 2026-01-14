import type { RegistrationFile } from '../src/models/interfaces';
import { EndpointType, TrustModel } from '../src/models/enums';
import { Agent } from '../src/core/agent';
import type { SDK } from '../src/core/sdk';

function makeAgentWithEndpoints(endpoints: RegistrationFile['endpoints']): Agent {
  const regFile: RegistrationFile = {
    name: 'Test Agent',
    description: 'Test',
    endpoints: [...endpoints],
    trustModels: [TrustModel.REPUTATION],
    owners: [],
    operators: [],
    active: true,
    x402support: false,
    metadata: {},
    updatedAt: 0,
  };

  // The removeEndpoint(s) helpers do not touch sdk, so a stub is fine here.
  return new Agent({} as unknown as SDK, regFile);
}

describe('Agent.removeEndpoint(s)', () => {
  it('removes all endpoints when called with no args', () => {
    const agent = makeAgentWithEndpoints([
      { type: EndpointType.MCP, value: 'https://mcp.example.com', meta: { version: '2025-06-18' } },
      { type: EndpointType.A2A, value: 'https://a2a.example.com/agent-card.json', meta: { version: '0.30' } },
    ]);

    agent.removeEndpoints();
    expect(agent.getRegistrationFile().endpoints).toEqual([]);
  });

  it('removes by type (wildcard over value)', () => {
    const agent = makeAgentWithEndpoints([
      { type: EndpointType.MCP, value: 'https://mcp-1.example.com' },
      { type: EndpointType.MCP, value: 'https://mcp-2.example.com' },
      { type: EndpointType.A2A, value: 'https://a2a.example.com/agent-card.json' },
    ]);

    agent.removeEndpoint(EndpointType.MCP);
    expect(agent.getRegistrationFile().endpoints).toEqual([
      { type: EndpointType.A2A, value: 'https://a2a.example.com/agent-card.json' },
    ]);
  });

  it('removes by value (wildcard over type)', () => {
    const agent = makeAgentWithEndpoints([
      { type: EndpointType.MCP, value: 'https://old-endpoint.com' },
      { type: EndpointType.A2A, value: 'https://old-endpoint.com' },
      { type: EndpointType.ENS, value: 'myagent.eth' },
    ]);

    agent.removeEndpoint({ value: 'https://old-endpoint.com' });
    expect(agent.getRegistrationFile().endpoints).toEqual([{ type: EndpointType.ENS, value: 'myagent.eth' }]);
  });

  it('removes only endpoints matching both type and value when both are provided', () => {
    const agent = makeAgentWithEndpoints([
      { type: EndpointType.MCP, value: 'https://old-endpoint.com' },
      { type: EndpointType.A2A, value: 'https://old-endpoint.com' },
      { type: EndpointType.MCP, value: 'https://new-endpoint.com' },
    ]);

    agent.removeEndpoint({ type: EndpointType.MCP, value: 'https://old-endpoint.com' });
    expect(agent.getRegistrationFile().endpoints).toEqual([
      { type: EndpointType.A2A, value: 'https://old-endpoint.com' },
      { type: EndpointType.MCP, value: 'https://new-endpoint.com' },
    ]);
  });
});

