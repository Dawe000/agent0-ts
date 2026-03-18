# MCP protocol reference (copied for SDK use)

These docs are copied from the [Model Context Protocol](https://github.com/modelcontextprotocol/specification) repository so the agent0 SDK can reference the protocol without depending on the full MCP repo. You can remove the `modelcontextprotocol/` clone from this repo once you rely on these copies.

## Contents

Minimal set needed for implementing an MCP **client** (tools, optional prompts/resources, connection):

- **specification-2025-06-18/** — Protocol spec: index, basic (lifecycle, transports, authorization, security), server (tools, prompts, resources), schema. Client features (sampling, elicitation, roots), server utilities (logging, pagination, etc.), and architecture overview were removed.
- **seps/** — Only [986 (tool name format)](seps/986-specify-format-for-tool-names.md), referenced by the SDK’s MCP_SPECIFICATION.md. Other SEPs were dropped; see the upstream repo for governance, OAuth, etc.
- **versioning.mdx** — How MCP versions and negotiation work.

For the SDK’s planned MCP support, see [MCP_SPECIFICATION.md](../MCP_SPECIFICATION.md).
