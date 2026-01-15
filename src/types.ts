import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * User information for error tracking
 */
export interface User {
  id?: string | number
  email?: string
  name?: string
  [key: string]: unknown
}

/**
 * Request information captured with errors
 */
export interface RequestInfo {
  url?: string
  method?: string
  path?: string
  query?: string
  headers?: Record<string, string | string[] | undefined>
  params?: Record<string, unknown>
  body?: unknown
  remoteIp?: string
  userAgent?: string
  referer?: string
  contentType?: string
  contentLength?: string | number
  [key: string]: unknown
}

/**
 * Context data attached to errors
 */
export type Context = Record<string, unknown>

/**
 * Notifier metadata sent with each error
 */
export interface Notifier {
  name: string
  version: string
  language: string
  language_version: string
}

/**
 * Error payload structure
 */
export interface ErrorPayload {
  class: string
  message: string
  backtrace: string[]
  occurred_at: string
  fingerprint?: string
  tags?: string[]
}

/**
 * Full notice payload sent to the API
 */
export interface NoticePayload {
  error: ErrorPayload
  context: Context
  request: RequestInfo
  user: User
  notifier: Notifier
}

/**
 * API response on successful error submission
 */
export interface ApiResponse {
  id: number
  problem_id: number
}

/**
 * Options for notify() calls
 */
export interface NotifyOptions {
  context?: Context
  request?: RequestInfo
  user?: User
  fingerprint?: string
  tags?: string[]
}

/**
 * Notice object before sending
 */
export interface Notice {
  errorClass: string
  message: string
  backtrace: string[]
  fingerprint?: string
  tags: string[]
  context: Context
  request: RequestInfo
  user: User
  environment?: string
  occurredAt: string
  appName?: string
  revision?: string
}

/**
 * Callback function called before sending a notice
 * Return false to prevent sending
 */
export type BeforeNotifyCallback = (notice: Notice) => boolean | void | Promise<boolean | void>

/**
 * Configuration options for the Checkend SDK
 */
export interface ConfigOptions {
  /** Your Checkend ingestion API key (required) */
  apiKey: string
  /** Checkend server endpoint (default: https://app.checkend.io) */
  endpoint?: string
  /** Environment name (default: from NODE_ENV) */
  environment?: string
  /** Enable/disable error reporting (default: true in production) */
  enabled?: boolean
  /** Request timeout in milliseconds (default: 15000) */
  timeout?: number
  /** Connection timeout in milliseconds (default: 5000) */
  connectTimeout?: number
  /** Exception class names or patterns to ignore */
  ignoredExceptions?: (string | RegExp)[]
  /** Keys to filter from context/request data */
  filterKeys?: string[]
  /** Callbacks to run before sending (return false to skip) */
  beforeNotify?: BeforeNotifyCallback[]
  /** Enable debug logging (default: false) */
  debug?: boolean
  /** Capture uncaught exceptions (default: true) */
  captureUncaughtExceptions?: boolean
  /** Capture unhandled promise rejections (default: true) */
  captureUnhandledRejections?: boolean
  /** Enable async sending via worker (default: true) */
  async?: boolean
  /** Maximum number of notices to queue (default: 1000) */
  maxQueueSize?: number
  /** Shutdown timeout in seconds (default: 5) */
  shutdownTimeout?: number
  /** Application root path for stack trace cleaning */
  rootPath?: string
  /** Custom logger */
  logger?: Logger
  /** Application name for error grouping and identification */
  appName?: string
  /** Application revision/version for deployment tracking */
  revision?: string
  /** Include request data in error reports (default: true) */
  sendRequestData?: boolean
  /** Include environment variables in error reports (default: false) */
  sendEnvironmentData?: boolean
  /** Include user data in error reports (default: true) */
  sendUserData?: boolean
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/**
 * HTTP request interface (framework agnostic)
 */
export interface HttpRequest extends IncomingMessage {
  body?: unknown
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  path?: string
  originalUrl?: string
  ip?: string
}

/**
 * HTTP response interface (framework agnostic)
 */
export type HttpResponse = ServerResponse
