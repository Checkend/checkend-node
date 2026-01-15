# @checkend/node

[![npm version](https://badge.fury.io/js/@checkend%2Fnode.svg)](https://badge.fury.io/js/@checkend%2Fnode)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Official Node.js SDK for [Checkend](https://github.com/furvur/checkend) error monitoring. Capture and report errors from Node.js applications with automatic integrations for Express, Koa, and Fastify.

## Features

- **Zero dependencies** - Uses only Node.js built-ins
- **Async sending** - Non-blocking error reporting via background queue
- **Automatic context** - Captures request, user, and environment data
- **AsyncLocalStorage** - Request-scoped context tracking
- **Sensitive data filtering** - Automatically scrubs passwords, tokens, etc.
- **Framework integrations** - Express, Koa, Fastify middleware
- **Testing utilities** - Mock SDK for unit testing

## Installation

```bash
npm install @checkend/node
# or
yarn add @checkend/node
# or
pnpm add @checkend/node
```

## Quick Start

```typescript
import Checkend from '@checkend/node'

Checkend.configure({
  apiKey: 'your-ingestion-key',
  // Or use environment variable: process.env.CHECKEND_API_KEY
})

// That's it! Uncaught exceptions and unhandled rejections are now captured.
```

## Framework Integrations

### Express

```typescript
import express from 'express'
import Checkend from '@checkend/node'
import { requestHandler, errorHandler } from '@checkend/node/express'

Checkend.configure({ apiKey: 'your-key' })

const app = express()

// Add request handler early in the middleware chain
app.use(requestHandler())

// Your routes...
app.get('/', (req, res) => {
  res.send('Hello World!')
})

// Add error handler as the last middleware
app.use(errorHandler())

app.listen(3000)
```

### Koa

```typescript
import Koa from 'koa'
import Checkend from '@checkend/node'
import { middleware } from '@checkend/node/koa'

Checkend.configure({ apiKey: 'your-key' })

const app = new Koa()

// Add middleware early in the chain
app.use(middleware())

// Your routes...
app.use(async (ctx) => {
  ctx.body = 'Hello World!'
})

app.listen(3000)
```

### Fastify

```typescript
import Fastify from 'fastify'
import Checkend from '@checkend/node'
import { plugin } from '@checkend/node/fastify'

Checkend.configure({ apiKey: 'your-key' })

const fastify = Fastify()

// Register the plugin
fastify.register(plugin)

// Your routes...
fastify.get('/', async () => {
  return { hello: 'world' }
})

fastify.listen({ port: 3000 })
```

## Manual Error Reporting

```typescript
import { notify, notifySync } from '@checkend/node'

try {
  // risky code
} catch (error) {
  notify(error as Error)
}

// With additional context
notify(error, {
  context: { orderId: 123 },
  user: { id: 'user-1', email: 'user@example.com' },
  tags: ['checkout', 'payment'],
  fingerprint: 'custom-grouping-key',
})

// Synchronous sending (returns promise)
const response = await notifySync(error)
```

## Configuration

```typescript
import Checkend from '@checkend/node'

Checkend.configure({
  // Required
  apiKey: 'your-ingestion-key',

  // Optional - Checkend server URL (default: https://app.checkend.io)
  endpoint: 'https://checkend.example.com',

  // Optional - Environment name (default: from NODE_ENV)
  environment: 'production',

  // Optional - Enable/disable reporting (default: true in production/staging)
  enabled: true,

  // Optional - Capture uncaught exceptions (default: true)
  captureUncaughtExceptions: true,

  // Optional - Capture unhandled promise rejections (default: true)
  captureUnhandledRejections: true,

  // Optional - Async sending (default: true)
  async: true,

  // Optional - Max notices to queue (default: 1000)
  maxQueueSize: 1000,

  // Optional - Shutdown timeout in seconds (default: 5)
  shutdownTimeout: 5,

  // Optional - Exceptions to ignore
  ignoredExceptions: ['MyCustomNotFoundError', /^ECONNRESET/],

  // Optional - Keys to filter from context/request data
  filterKeys: ['creditCard', 'ssn'],

  // Optional - Callbacks before sending (return false to skip)
  beforeNotify: [
    (notice) => {
      notice.context.deployVersion = process.env.DEPLOY_VERSION
      return true // Return true to send, false to skip
    },
  ],

  // Optional - Request timeout in milliseconds (default: 15000)
  timeout: 15000,

  // Optional - Connection timeout in milliseconds (default: 5000)
  connectTimeout: 5000,

  // Optional - Application root path for stack trace cleaning
  rootPath: process.cwd(),

  // Optional - Enable debug logging (default: false)
  debug: false,
})
```

### Environment Variables

The SDK respects these environment variables:

| Variable | Description |
|----------|-------------|
| `CHECKEND_API_KEY` | Your ingestion API key |
| `CHECKEND_ENDPOINT` | Custom server endpoint |
| `CHECKEND_ENVIRONMENT` | Override environment name |
| `CHECKEND_DEBUG` | Enable debug logging (`true`/`false`) |

## Context and User Tracking

```typescript
import { setContext, setUser, clear, runWithContext } from '@checkend/node'

// Set global context (included with all errors)
setContext({
  accountId: 'acc-123',
  featureFlag: 'new_checkout',
})

// Track current user
setUser({
  id: 'user-1',
  email: 'user@example.com',
  name: 'Jane Doe',
})

// Clear context (e.g., on logout)
clear()

// Run code with isolated context (using AsyncLocalStorage)
runWithContext(() => {
  setContext({ requestSpecific: 'data' })
  // This context is isolated from other async operations
})
```

## Graceful Shutdown

```typescript
import Checkend from '@checkend/node'

// Flush pending notices before shutdown
process.on('SIGTERM', async () => {
  await Checkend.flush()
  await Checkend.stop()
  process.exit(0)
})
```

## Testing

Use the Testing module to capture notices without sending them:

```typescript
import Checkend, { notify } from '@checkend/node'
import { Testing } from '@checkend/node/testing'

describe('Error handling', () => {
  beforeEach(() => {
    Testing.setup()
    Checkend.configure({ apiKey: 'test-key' })
  })

  afterEach(async () => {
    await Checkend.reset()
    Testing.teardown()
  })

  test('reports errors', () => {
    notify(new Error('Test error'))

    expect(Testing.notices).toHaveLength(1)
    expect(Testing.lastNotice?.errorClass).toBe('Error')
    expect(Testing.lastNotice?.message).toBe('Test error')
  })
})
```

### Testing API

| Method | Description |
|--------|-------------|
| `Testing.setup()` | Enable test mode, intercept network calls |
| `Testing.teardown()` | Restore normal mode, clear notices |
| `Testing.notices` | Array of captured Notice objects |
| `Testing.lastNotice` | Most recent notice |
| `Testing.firstNotice` | First captured notice |
| `Testing.noticeCount()` | Number of captured notices |
| `Testing.hasNotices()` | True if any notices captured |
| `Testing.clearNotices()` | Clear captured notices |

## Filtering Sensitive Data

The SDK automatically filters sensitive data from context and request data.

Default filtered keys: `password`, `secret`, `token`, `api_key`, `authorization`, `credit_card`, `cvv`, `ssn`

Add custom keys:

```typescript
Checkend.configure({
  apiKey: 'your-key',
  filterKeys: ['socialSecurityNumber', 'bankAccount'],
})
```

## Ignoring Exceptions

Some exceptions don't need to be reported:

```typescript
Checkend.configure({
  apiKey: 'your-key',
  ignoredExceptions: [
    // By class name
    'MyCustomNotFoundError',
    // By error code
    'ECONNRESET',
    // By regex pattern
    /^ECONNREFUSED/,
  ],
})
```

Default ignored: `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `EPIPE`

## Requirements

- Node.js >= 18.0.0
- No runtime dependencies (uses Node.js built-ins only)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests (67 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck
```

### Test Suite

The SDK includes comprehensive tests using Vitest:

| Test File | Tests | Description |
|-----------|-------|-------------|
| `test/configuration.test.ts` | 21 | Config options, env vars, validation |
| `test/notice.test.ts` | 11 | Notice creation, rootPath cleaning, payload |
| `test/sanitize.test.ts` | 9 | Filtering, Buffer handling, deep nesting |
| `test/worker.test.ts` | 8 | Queue operations, shutdown, flush |
| `test/index.test.ts` | 18 | Main API: notify, context, user, runWithContext |

Run a specific test file:

```bash
npm test -- test/worker.test.ts
```

## License

MIT License. See [LICENSE](LICENSE) for details.
