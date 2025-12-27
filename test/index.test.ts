import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  configure,
  notify,
  notifySync,
  setContext,
  setUser,
  getContext,
  getUser,
  clear,
  reset,
  runWithContext,
} from '../src/index'
import { Testing } from '../src/testing'

describe('Checkend Node SDK', () => {
  beforeEach(() => {
    Testing.setup()
  })

  afterEach(async () => {
    await reset()
    Testing.teardown()
  })

  describe('configure', () => {
    it('initializes SDK with valid config', () => {
      configure({ apiKey: 'test-key' })
      // Should not throw
    })

    it('warns with invalid config', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      configure({ apiKey: '' })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid configuration'))
      warnSpy.mockRestore()
    })
  })

  describe('notify', () => {
    it('captures error notices', () => {
      configure({ apiKey: 'test-key', enabled: true, async: false })

      notify(new Error('Test error'))

      expect(Testing.hasNotices()).toBe(true)
      expect(Testing.lastNotice?.errorClass).toBe('Error')
      expect(Testing.lastNotice?.message).toBe('Test error')
    })

    it('includes context', () => {
      configure({ apiKey: 'test-key', enabled: true, async: false })

      notify(new Error('Test error'), {
        context: { orderId: 123 },
      })

      expect(Testing.lastNotice?.context.orderId).toBe(123)
    })

    it('includes user', () => {
      configure({ apiKey: 'test-key', enabled: true, async: false })

      notify(new Error('Test error'), {
        user: { id: 'user-1', email: 'test@example.com' },
      })

      expect(Testing.lastNotice?.user.id).toBe('user-1')
      expect(Testing.lastNotice?.user.email).toBe('test@example.com')
    })

    it('includes tags', () => {
      configure({ apiKey: 'test-key', enabled: true, async: false })

      notify(new Error('Test error'), {
        tags: ['checkout', 'payment'],
      })

      expect(Testing.lastNotice?.tags).toContain('checkout')
      expect(Testing.lastNotice?.tags).toContain('payment')
    })

    it('does not send when disabled', () => {
      configure({ apiKey: 'test-key', enabled: false })

      notify(new Error('Test error'))

      expect(Testing.hasNotices()).toBe(false)
    })

    it('ignores configured exceptions', () => {
      configure({
        apiKey: 'test-key',
        enabled: true,
        async: false,
        ignoredExceptions: ['IgnoredError'],
      })

      const error = new Error('Ignored message')
      error.name = 'IgnoredError'
      notify(error)

      expect(Testing.hasNotices()).toBe(false)
    })

    it('filters sensitive data', () => {
      configure({ apiKey: 'test-key', enabled: true, async: false })

      notify(new Error('Test error'), {
        context: { password: 'secret123', username: 'john' },
      })

      expect(Testing.lastNotice?.context.password).toBe('[FILTERED]')
      expect(Testing.lastNotice?.context.username).toBe('john')
    })
  })

  describe('notifySync', () => {
    it('returns promise with response', async () => {
      configure({ apiKey: 'test-key', enabled: true })

      const result = await notifySync(new Error('Test error'))

      expect(result).toBeDefined()
      expect(Testing.hasNotices()).toBe(true)
    })
  })

  describe('context management', () => {
    it('sets and gets global context', () => {
      configure({ apiKey: 'test-key', enabled: true })

      setContext({ key1: 'value1' })
      setContext({ key2: 'value2' })

      const context = getContext()
      expect(context.key1).toBe('value1')
      expect(context.key2).toBe('value2')
    })

    it('merges context with notify options', () => {
      configure({ apiKey: 'test-key', enabled: true, async: false })

      setContext({ global: 'value' })
      notify(new Error('Test'), { context: { local: 'value' } })

      expect(Testing.lastNotice?.context.global).toBe('value')
      expect(Testing.lastNotice?.context.local).toBe('value')
    })

    it('clears context', () => {
      configure({ apiKey: 'test-key', enabled: true })

      setContext({ key: 'value' })
      clear()

      const context = getContext()
      expect(context.key).toBeUndefined()
    })
  })

  describe('user management', () => {
    it('sets and gets user', () => {
      configure({ apiKey: 'test-key', enabled: true })

      setUser({ id: 'user-1', email: 'test@example.com' })

      const user = getUser()
      expect(user.id).toBe('user-1')
      expect(user.email).toBe('test@example.com')
    })

    it('merges user with notify options', () => {
      configure({ apiKey: 'test-key', enabled: true, async: false })

      setUser({ id: 'user-1' })
      notify(new Error('Test'), { user: { email: 'override@example.com' } })

      expect(Testing.lastNotice?.user.id).toBe('user-1')
      expect(Testing.lastNotice?.user.email).toBe('override@example.com')
    })
  })

  describe('runWithContext', () => {
    it('isolates context within callback', () => {
      configure({ apiKey: 'test-key', enabled: true })

      setContext({ global: 'value' })

      runWithContext(() => {
        setContext({ local: 'value' })
        const context = getContext()
        expect(context.global).toBe('value')
        expect(context.local).toBe('value')
      })

      // Local context should not leak
      const outerContext = getContext()
      expect(outerContext.global).toBe('value')
      expect(outerContext.local).toBeUndefined()
    })
  })

  describe('beforeNotify callbacks', () => {
    it('allows modifying notice', () => {
      configure({
        apiKey: 'test-key',
        enabled: true,
        async: false,
        beforeNotify: [
          (notice) => {
            notice.context.added = 'by callback'
            return true
          },
        ],
      })

      notify(new Error('Test error'))

      expect(Testing.lastNotice?.context.added).toBe('by callback')
    })

    it('blocks notice when returning false', () => {
      configure({
        apiKey: 'test-key',
        enabled: true,
        async: false,
        beforeNotify: [() => false],
      })

      notify(new Error('Test error'))

      expect(Testing.hasNotices()).toBe(false)
    })
  })
})
