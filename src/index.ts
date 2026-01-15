import { AsyncLocalStorage } from 'node:async_hooks'
import { Configuration } from './configuration'
import { Client } from './client'
import { Worker } from './worker'
import { SanitizeFilter } from './filters/sanitize'
import { createNotice } from './notice'
import type {
  ConfigOptions,
  Notice,
  NotifyOptions,
  Context,
  User,
  RequestInfo,
  ApiResponse,
} from './types'

export type {
  ConfigOptions,
  Notice,
  NotifyOptions,
  Context,
  User,
  RequestInfo,
  ApiResponse,
  BeforeNotifyCallback,
  Logger,
  HttpRequest,
  HttpResponse,
} from './types'

export { VERSION } from './version'

// Global state
let config: Configuration | null = null
let client: Client | null = null
let worker: Worker | null = null
let sanitizeFilter: SanitizeFilter | null = null
let started = false

// Context storage using AsyncLocalStorage for request-scoped context
const asyncLocalStorage = new AsyncLocalStorage<{
  context: Context
  user: User
  request: RequestInfo
}>()

// Global context (fallback when not in async context)
let globalContext: Context = {}
let globalUser: User = {}

// Original handlers for restoration
let originalUncaughtExceptionHandler: NodeJS.UncaughtExceptionListener | null = null
let originalUnhandledRejectionHandler: NodeJS.UnhandledRejectionListener | null = null
let shutdownHooksInstalled = false

/**
 * Configure the Checkend Node SDK
 */
export function configure(options: ConfigOptions): void {
  config = new Configuration(options)

  if (!config.isValid()) {
    config.logger.warn('Invalid configuration: apiKey is required')
    return
  }

  client = new Client(config)
  worker = config.async ? new Worker(config) : null
  sanitizeFilter = new SanitizeFilter(config.filterKeys)

  start()
}

/**
 * Start the SDK (install error handlers)
 */
function start(): void {
  if (started || !config) return

  started = true

  if (config.captureUncaughtExceptions) {
    installUncaughtExceptionHandler()
  }

  if (config.captureUnhandledRejections) {
    installUnhandledRejectionHandler()
  }

  // Install shutdown hooks
  installShutdownHooks()

  config.logger.info(`Started (environment: ${config.environment}, async: ${config.async})`)
}

/**
 * Stop the SDK and clean up
 */
export async function stop(timeout?: number): Promise<void> {
  if (!started) return

  uninstallUncaughtExceptionHandler()
  uninstallUnhandledRejectionHandler()

  if (worker) {
    await worker.stop(timeout)
    worker = null
  }

  started = false
  config?.logger.info('Stopped')
}

/**
 * Flush pending notices, blocking until sent
 */
export async function flush(timeout?: number): Promise<void> {
  if (worker) {
    await worker.flush(timeout)
  }
}

/**
 * Reset all SDK state
 */
export async function reset(): Promise<void> {
  await stop(0)
  config = null
  client = null
  worker = null
  sanitizeFilter = null
  globalContext = {}
  globalUser = {}
}

// ========== Primary API ==========

/**
 * Report an error to Checkend
 */
export function notify(error: Error, options: NotifyOptions = {}): void {
  if (!shouldNotify() || !config) return

  const errorClass = error.name || 'Error'
  const message = error.message || 'Unknown error'
  const code = (error as NodeJS.ErrnoException).code

  if (config.shouldIgnore(errorClass, message, code)) {
    log(`Ignoring error: ${errorClass}`)
    return
  }

  const { context: localContext, user: localUser, request: localRequest } = getLocalStorage()

  // Build context with optional environment data
  let contextData = { ...globalContext, ...localContext, ...options.context }
  if (config.sendEnvironmentData) {
    contextData = { ...contextData, env: sanitize({ ...process.env }) }
  }
  const mergedContext = sanitize(contextData)

  // Include user data based on config
  const mergedUser = config.sendUserData
    ? sanitize({ ...globalUser, ...localUser, ...options.user })
    : {}

  // Include request data based on config
  const mergedRequest = config.sendRequestData
    ? sanitize({ ...localRequest, ...options.request })
    : {}

  const notice = createNotice(error, {
    context: mergedContext,
    request: mergedRequest,
    user: mergedUser,
    fingerprint: options.fingerprint,
    tags: options.tags,
    environment: config.environment,
    rootPath: config.rootPath,
    appName: config.appName,
    revision: config.revision,
  })

  if (!runBeforeNotifyCallbacks(notice)) {
    return
  }

  sendNotice(notice)
}

/**
 * Report an error synchronously (returns promise)
 */
export async function notifySync(error: Error, options: NotifyOptions = {}): Promise<ApiResponse | null> {
  if (!shouldNotify() || !config || !client) return null

  const { context: localContext, user: localUser, request: localRequest } = getLocalStorage()

  // Build context with optional environment data
  let contextData = { ...globalContext, ...localContext, ...options.context }
  if (config.sendEnvironmentData) {
    contextData = { ...contextData, env: sanitize({ ...process.env }) }
  }
  const mergedContext = sanitize(contextData)

  // Include user data based on config
  const mergedUser = config.sendUserData
    ? sanitize({ ...globalUser, ...localUser, ...options.user })
    : {}

  // Include request data based on config
  const mergedRequest = config.sendRequestData
    ? sanitize({ ...localRequest, ...options.request })
    : {}

  const notice = createNotice(error, {
    context: mergedContext,
    request: mergedRequest,
    user: mergedUser,
    fingerprint: options.fingerprint,
    tags: options.tags,
    environment: config.environment,
    rootPath: config.rootPath,
    appName: config.appName,
    revision: config.revision,
  })

  if (!runBeforeNotifyCallbacks(notice)) {
    return null
  }

  return client.sendNotice(notice)
}

// ========== Context Management ==========

/**
 * Set global context data that will be included with all errors
 */
export function setContext(context: Context): void {
  const store = asyncLocalStorage.getStore()
  if (store) {
    Object.assign(store.context, context)
  } else {
    globalContext = { ...globalContext, ...context }
  }
}

/**
 * Set user information for error tracking
 */
export function setUser(user: User): void {
  const store = asyncLocalStorage.getStore()
  if (store) {
    Object.assign(store.user, user)
  } else {
    globalUser = { ...globalUser, ...user }
  }
}

/**
 * Set request information for the current context
 */
export function setRequest(request: RequestInfo): void {
  const store = asyncLocalStorage.getStore()
  if (store) {
    Object.assign(store.request, request)
  }
}

/**
 * Get the current context
 */
export function getContext(): Context {
  const store = asyncLocalStorage.getStore()
  return { ...globalContext, ...(store?.context ?? {}) }
}

/**
 * Get the current user
 */
export function getUser(): User {
  const store = asyncLocalStorage.getStore()
  return { ...globalUser, ...(store?.user ?? {}) }
}

/**
 * Clear all context and user data
 */
export function clear(): void {
  const store = asyncLocalStorage.getStore()
  if (store) {
    store.context = {}
    store.user = {}
    store.request = {}
  } else {
    globalContext = {}
    globalUser = {}
  }
}

/**
 * Run a function with isolated context
 *
 * Context set within the callback is isolated from other async operations.
 */
export function runWithContext<T>(callback: () => T): T {
  return asyncLocalStorage.run(
    { context: {}, user: {}, request: {} },
    callback
  )
}

/**
 * Run an async function with isolated context
 */
export function runWithContextAsync<T>(callback: () => Promise<T>): Promise<T> {
  return asyncLocalStorage.run(
    { context: {}, user: {}, request: {} },
    callback
  )
}

// ========== Error Handlers ==========

function installUncaughtExceptionHandler(): void {
  originalUncaughtExceptionHandler = process.listeners('uncaughtException')[0] as NodeJS.UncaughtExceptionListener | undefined ?? null

  process.on('uncaughtException', handleUncaughtException)
}

function uninstallUncaughtExceptionHandler(): void {
  process.removeListener('uncaughtException', handleUncaughtException)
}

function installUnhandledRejectionHandler(): void {
  originalUnhandledRejectionHandler = process.listeners('unhandledRejection')[0] as NodeJS.UnhandledRejectionListener | undefined ?? null

  process.on('unhandledRejection', handleUnhandledRejection)
}

function uninstallUnhandledRejectionHandler(): void {
  process.removeListener('unhandledRejection', handleUnhandledRejection)
}

function handleUncaughtException(error: Error, origin: NodeJS.UncaughtExceptionOrigin): void {
  if (!shouldNotify() || !config) return

  const code = (error as NodeJS.ErrnoException).code
  if (config.shouldIgnore(error.name, error.message, code)) {
    return
  }

  const notice = createNotice(error, {
    context: sanitize({ ...globalContext, unhandled: true, origin }),
    tags: ['unhandled', 'uncaughtException'],
    environment: config.environment,
    rootPath: config.rootPath,
    appName: config.appName,
    revision: config.revision,
  })

  // Send synchronously for uncaught exceptions
  client?.sendNotice(notice).catch((err) => {
    config?.logger.debug(`Failed to send uncaught exception notice: ${err instanceof Error ? err.message : err}`)
  })

  // Call original handler if it exists
  if (originalUncaughtExceptionHandler) {
    originalUncaughtExceptionHandler(error, origin)
  }
}

function handleUnhandledRejection(reason: unknown, promise: Promise<unknown>): void {
  if (!shouldNotify() || !config) return

  let error: Error
  if (reason instanceof Error) {
    error = reason
  } else if (typeof reason === 'string') {
    error = new Error(reason)
    error.name = 'UnhandledRejection'
  } else {
    error = new Error('Unhandled Promise rejection')
    error.name = 'UnhandledRejection'
  }

  const code = (error as NodeJS.ErrnoException).code
  if (config.shouldIgnore(error.name, error.message, code)) {
    return
  }

  const notice = createNotice(error, {
    context: sanitize({ ...globalContext, unhandled: true, rejection: true }),
    tags: ['unhandled', 'unhandledRejection'],
    environment: config.environment,
    rootPath: config.rootPath,
    appName: config.appName,
    revision: config.revision,
  })

  // Queue for async sending
  sendNotice(notice)

  // Call original handler if it exists
  if (originalUnhandledRejectionHandler) {
    originalUnhandledRejectionHandler(reason, promise)
  }
}

let isShuttingDown = false

function installShutdownHooks(): void {
  if (shutdownHooksInstalled) return
  shutdownHooksInstalled = true

  const shutdown = async () => {
    if (isShuttingDown) return
    isShuttingDown = true
    await stop()
  }

  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  process.once('beforeExit', shutdown)
}

// ========== Helpers ==========

function shouldNotify(): boolean {
  if (!started || !config || !client) return false
  if (!config.isValid()) return false
  if (!config.enabled) return false
  return true
}

function runBeforeNotifyCallbacks(notice: Notice): boolean {
  if (!config) return true

  for (const callback of config.beforeNotify) {
    try {
      const result = callback(notice)
      if (result === false) {
        log('Notice blocked by beforeNotify callback')
        return false
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      config.logger.warn(`beforeNotify callback failed: ${errorMsg}`)
    }
  }

  return true
}

function sendNotice(notice: Notice): void {
  if (worker) {
    worker.push(notice)
  } else {
    client?.sendNotice(notice).catch((err) => {
      config?.logger.debug(`Failed to send notice: ${err instanceof Error ? err.message : err}`)
    })
  }
}

function sanitize<T>(data: T): T {
  if (!sanitizeFilter) return data
  return sanitizeFilter.sanitize(data)
}

function getLocalStorage(): { context: Context; user: User; request: RequestInfo } {
  const store = asyncLocalStorage.getStore()
  return store ?? { context: {}, user: {}, request: {} }
}

function log(message: string): void {
  config?.logger.debug(message)
}

// Export the AsyncLocalStorage for integrations
export { asyncLocalStorage }

/**
 * Get the current configuration (for use by integrations)
 */
export function getConfiguration(): Configuration | null {
  return config
}

// Export Configuration type for integrations
export { Configuration } from './configuration'

// Default export for convenience
export default {
  configure,
  stop,
  flush,
  reset,
  notify,
  notifySync,
  setContext,
  setUser,
  setRequest,
  getContext,
  getUser,
  clear,
  runWithContext,
  runWithContextAsync,
  getConfiguration,
}
