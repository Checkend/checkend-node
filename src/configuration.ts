import type { ConfigOptions, BeforeNotifyCallback, Logger } from './types'

const DEFAULT_ENDPOINT = 'https://app.checkend.io'

const DEFAULT_FILTER_KEYS = [
  'password',
  'password_confirmation',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apiKey',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'authorization',
  'bearer',
  'credit_card',
  'creditCard',
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',
  'ssn',
]

const DEFAULT_IGNORED_EXCEPTIONS = [
  // Common expected errors
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
]

/**
 * Default logger using console
 */
class DefaultLogger implements Logger {
  constructor(private debug_: boolean) {}

  debug(message: string): void {
    if (this.debug_) {
      console.debug(`[Checkend] ${message}`)
    }
  }

  info(message: string): void {
    console.info(`[Checkend] ${message}`)
  }

  warn(message: string): void {
    console.warn(`[Checkend] ${message}`)
  }

  error(message: string): void {
    console.error(`[Checkend] ${message}`)
  }
}

/**
 * Configuration holds all settings for the Checkend Node SDK.
 */
export class Configuration {
  apiKey: string
  endpoint: string
  environment: string
  private _enabled?: boolean
  timeout: number
  connectTimeout: number
  ignoredExceptions: (string | RegExp)[]
  filterKeys: string[]
  beforeNotify: BeforeNotifyCallback[]
  debug: boolean
  captureUncaughtExceptions: boolean
  captureUnhandledRejections: boolean
  async: boolean
  maxQueueSize: number
  shutdownTimeout: number
  rootPath?: string
  logger: Logger
  appName?: string
  revision?: string
  sendRequestData: boolean
  sendSessionData: boolean
  sendEnvironmentData: boolean
  sendUserData: boolean

  constructor(options: ConfigOptions) {
    this.apiKey = options.apiKey || process.env.CHECKEND_API_KEY || ''
    this.endpoint = options.endpoint || process.env.CHECKEND_ENDPOINT || DEFAULT_ENDPOINT
    this.environment = options.environment || this.detectEnvironment()
    this._enabled = options.enabled
    this.timeout = options.timeout ?? 15000
    this.connectTimeout = options.connectTimeout ?? 5000
    this.ignoredExceptions = [
      ...DEFAULT_IGNORED_EXCEPTIONS,
      ...(options.ignoredExceptions ?? []),
    ]
    this.filterKeys = [
      ...DEFAULT_FILTER_KEYS,
      ...(options.filterKeys ?? []),
    ]
    this.beforeNotify = options.beforeNotify ?? []
    this.debug = options.debug ?? process.env.CHECKEND_DEBUG === 'true'
    this.captureUncaughtExceptions = options.captureUncaughtExceptions ?? true
    this.captureUnhandledRejections = options.captureUnhandledRejections ?? true
    this.async = options.async ?? true
    this.maxQueueSize = options.maxQueueSize ?? 1000
    this.shutdownTimeout = options.shutdownTimeout ?? 5
    this.rootPath = options.rootPath || process.cwd()
    this.logger = options.logger ?? new DefaultLogger(this.debug)
    this.appName = options.appName || process.env.CHECKEND_APP_NAME
    this.revision = options.revision || process.env.CHECKEND_REVISION
    this.sendRequestData = options.sendRequestData ?? true
    this.sendSessionData = options.sendSessionData ?? true
    this.sendEnvironmentData = options.sendEnvironmentData ?? false
    this.sendUserData = options.sendUserData ?? true
  }

  /**
   * Check if configuration is valid for sending errors
   */
  isValid(): boolean {
    return Boolean(this.apiKey && this.endpoint)
  }

  /**
   * Check if SDK is enabled
   */
  get enabled(): boolean {
    if (this._enabled !== undefined) {
      return this._enabled
    }
    return this.isProductionOrStaging()
  }

  set enabled(value: boolean) {
    this._enabled = value
  }

  /**
   * Check if an error should be ignored
   */
  shouldIgnore(errorClass: string, message: string, code?: string): boolean {
    const patterns = this.ignoredExceptions
    return patterns.some((pattern) => {
      if (typeof pattern === 'string') {
        return errorClass === pattern || message === pattern || code === pattern
      }
      if (pattern instanceof RegExp) {
        return pattern.test(errorClass) || pattern.test(message) || (code && pattern.test(code))
      }
      return false
    })
  }

  /**
   * Get the ingest URL
   */
  get ingestUrl(): string {
    return `${this.endpoint}/ingest/v1/errors`
  }

  private detectEnvironment(): string {
    return process.env.CHECKEND_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'development'
  }

  private isProductionOrStaging(): boolean {
    return ['production', 'staging'].includes(this.environment)
  }
}
