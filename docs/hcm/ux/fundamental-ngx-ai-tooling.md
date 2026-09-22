# Fundamental NGX AI tooling

Fundamental NGX publishes an MCP server exposing component metadata, APIs, examples, accessibility guidance, comparisons and usage guides.

Use it as **reference tooling**, not a product dependency.

Recommended command for an MCP-capable editor/agent configuration:

```text
npx -y @fundamental-ngx/mcp@0.64.3
```

Do not add the MCP package to HCM runtime dependencies.

Before implementing a complex table, form or page composition, the AI should use MCP discovery/compare/usage-guide tools when available and then confirm against the packages actually installed in this repo.
