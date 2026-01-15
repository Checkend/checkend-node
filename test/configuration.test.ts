import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Configuration } from '../src/configuration'

describe('Configuration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('constructor', () => {
    it('sets required apiKey from options', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.apiKey).toBe('test-key')
    })

    it('uses CHECKEND_API_KEY env var as fallback', () => {
      process.env.CHECKEND_API_KEY = 'env-key'
      const config = new Configuration({ apiKey: '' })
      expect(config.apiKey).toBe('env-key')
    })

    it('uses default endpoint', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.endpoint).toBe('https://app.checkend.io')
    })

    it('uses CHECKEND_ENDPOINT env var', () => {
      process.env.CHECKEND_ENDPOINT = 'https://custom.example.com'
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.endpoint).toBe('https://custom.example.com')
    })

    it('allows custom endpoint', () => {
      const config = new Configuration({
        apiKey: 'test-key',
        endpoint: 'https://custom.example.com',
      })
      expect(config.endpoint).toBe('https://custom.example.com')
    })

    it('detects environment from NODE_ENV', () => {
      process.env.NODE_ENV = 'production'
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.environment).toBe('production')
    })

    it('uses CHECKEND_ENVIRONMENT over NODE_ENV', () => {
      process.env.NODE_ENV = 'production'
      process.env.CHECKEND_ENVIRONMENT = 'staging'
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.environment).toBe('staging')
    })

    it('sets default filter keys', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.filterKeys).toContain('password')
      expect(config.filterKeys).toContain('token')
      expect(config.filterKeys).toContain('authorization')
    })

    it('merges custom filter keys', () => {
      const config = new Configuration({
        apiKey: 'test-key',
        filterKeys: ['customSecret'],
      })
      expect(config.filterKeys).toContain('password')
      expect(config.filterKeys).toContain('customSecret')
    })

    it('sets async to true by default', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.async).toBe(true)
    })

    it('sets maxQueueSize to 1000 by default', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.maxQueueSize).toBe(1000)
    })

    it('sets appName from options', () => {
      const config = new Configuration({ apiKey: 'test-key', appName: 'my-app' })
      expect(config.appName).toBe('my-app')
    })

    it('uses CHECKEND_APP_NAME env var as fallback', () => {
      process.env.CHECKEND_APP_NAME = 'env-app'
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.appName).toBe('env-app')
    })

    it('sets revision from options', () => {
      const config = new Configuration({ apiKey: 'test-key', revision: 'v1.2.3' })
      expect(config.revision).toBe('v1.2.3')
    })

    it('uses CHECKEND_REVISION env var as fallback', () => {
      process.env.CHECKEND_REVISION = 'abc123'
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.revision).toBe('abc123')
    })

    it('sets sendRequestData to true by default', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.sendRequestData).toBe(true)
    })

    it('allows disabling sendRequestData', () => {
      const config = new Configuration({ apiKey: 'test-key', sendRequestData: false })
      expect(config.sendRequestData).toBe(false)
    })

    it('sets sendUserData to true by default', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.sendUserData).toBe(true)
    })

    it('allows disabling sendUserData', () => {
      const config = new Configuration({ apiKey: 'test-key', sendUserData: false })
      expect(config.sendUserData).toBe(false)
    })

    it('sets sendEnvironmentData to false by default', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.sendEnvironmentData).toBe(false)
    })

    it('allows enabling sendEnvironmentData', () => {
      const config = new Configuration({ apiKey: 'test-key', sendEnvironmentData: true })
      expect(config.sendEnvironmentData).toBe(true)
    })
  })

  describe('isValid', () => {
    it('returns true when apiKey and endpoint are set', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.isValid()).toBe(true)
    })

    it('returns false when apiKey is empty', () => {
      const config = new Configuration({ apiKey: '' })
      expect(config.isValid()).toBe(false)
    })
  })

  describe('enabled', () => {
    it('respects explicit enabled setting', () => {
      const config = new Configuration({ apiKey: 'test-key', enabled: false })
      expect(config.enabled).toBe(false)
    })

    it('is enabled in production by default', () => {
      process.env.NODE_ENV = 'production'
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.enabled).toBe(true)
    })

    it('is disabled in development by default', () => {
      process.env.NODE_ENV = 'development'
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.enabled).toBe(false)
    })
  })

  describe('shouldIgnore', () => {
    it('ignores errors matching string pattern', () => {
      const config = new Configuration({
        apiKey: 'test-key',
        ignoredExceptions: ['CustomError'],
      })
      expect(config.shouldIgnore('CustomError', 'some message')).toBe(true)
      expect(config.shouldIgnore('OtherError', 'some message')).toBe(false)
    })

    it('ignores errors matching regex pattern', () => {
      const config = new Configuration({
        apiKey: 'test-key',
        ignoredExceptions: [/^ECONN/],
      })
      expect(config.shouldIgnore('Error', 'failed', 'ECONNRESET')).toBe(true)
      expect(config.shouldIgnore('Error', 'failed', 'OTHER')).toBe(false)
    })

    it('includes default ignored exceptions', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.shouldIgnore('Error', 'connection reset', 'ECONNRESET')).toBe(true)
    })
  })

  describe('ingestUrl', () => {
    it('builds correct ingest URL', () => {
      const config = new Configuration({ apiKey: 'test-key' })
      expect(config.ingestUrl).toBe('https://app.checkend.io/ingest/v1/errors')
    })

    it('uses custom endpoint', () => {
      const config = new Configuration({
        apiKey: 'test-key',
        endpoint: 'https://custom.example.com',
      })
      expect(config.ingestUrl).toBe('https://custom.example.com/ingest/v1/errors')
    })
  })
})
