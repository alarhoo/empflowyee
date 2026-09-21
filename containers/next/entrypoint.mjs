import { parseNodeRuntimeConfig } from './runtime-contract.cjs'

// Validate with the compiled shared contract before Next opens its listener.
// Importing the standalone server in this process preserves its SIGTERM handling as PID 1.
parseNodeRuntimeConfig(process.env)
await import('./apps/marketing/web/server.js')
