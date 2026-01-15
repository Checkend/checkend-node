import { describe, it, expect } from 'vitest'
import { createNotice, toPayload } from '../src/notice'

describe('createNotice', () => {
  it('creates notice from Error', () => {
    const error = new Error('Test error')
    error.name = 'TestError'

    const notice = createNotice(error)

    expect(notice.errorClass).toBe('TestError')
    expect(notice.message).toBe('Test error')
    expect(notice.backtrace).toBeInstanceOf(Array)
    expect(notice.occurredAt).toBeDefined()
  })

  it('includes context', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      context: { orderId: 123 },
    })

    expect(notice.context.orderId).toBe(123)
  })

  it('includes user', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      user: { id: 'user-1', email: 'test@example.com' },
    })

    expect(notice.user.id).toBe('user-1')
    expect(notice.user.email).toBe('test@example.com')
  })

  it('includes tags', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      tags: ['checkout', 'payment'],
    })

    expect(notice.tags).toEqual(['checkout', 'payment'])
  })

  it('includes fingerprint', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      fingerprint: 'custom-fingerprint',
    })

    expect(notice.fingerprint).toBe('custom-fingerprint')
  })

  it('includes environment', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      environment: 'production',
    })

    expect(notice.environment).toBe('production')
  })

  it('cleans backtrace with rootPath', () => {
    const error = new Error('Test error')
    // Create a stack that includes a project path
    error.stack = `Error: Test error
    at Object.<anonymous> (/Users/test/project/src/index.ts:10:5)
    at Module._compile (node:internal/modules/cjs/loader:1234:14)`

    const notice = createNotice(error, {
      rootPath: '/Users/test/project',
    })

    expect(notice.backtrace[0]).toContain('[PROJECT_ROOT]')
    expect(notice.backtrace[0]).not.toContain('/Users/test/project')
  })

  it('truncates long messages', () => {
    const longMessage = 'x'.repeat(15000)
    const error = new Error(longMessage)

    const notice = createNotice(error)

    expect(notice.message.length).toBeLessThan(longMessage.length)
    expect(notice.message).toContain('...')
  })

  it('handles empty error message', () => {
    const error = new Error()
    const notice = createNotice(error)

    expect(notice.message).toBe('Unknown error')
  })

  it('includes appName', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      appName: 'my-app',
    })

    expect(notice.appName).toBe('my-app')
  })

  it('includes revision', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      revision: 'v1.2.3',
    })

    expect(notice.revision).toBe('v1.2.3')
  })
})

describe('toPayload', () => {
  it('converts notice to API payload format', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      context: { key: 'value' },
      user: { id: 'user-1' },
      tags: ['test'],
      environment: 'test',
    })

    const payload = toPayload(notice)

    expect(payload.error.class).toBe('Error')
    expect(payload.error.message).toBe('Test error')
    expect(payload.error.backtrace).toBeInstanceOf(Array)
    expect(payload.error.occurred_at).toBeDefined()
    expect(payload.error.tags).toEqual(['test'])
    expect(payload.context.key).toBe('value')
    expect(payload.context.environment).toBe('test')
    expect(payload.user.id).toBe('user-1')
    expect(payload.notifier.name).toBe('@checkend/node')
    expect(payload.notifier.language).toBe('javascript')
    expect(payload.notifier.language_version).toBe(process.version)
  })

  it('omits tags if empty', () => {
    const error = new Error('Test error')
    const notice = createNotice(error)

    const payload = toPayload(notice)

    expect(payload.error.tags).toBeUndefined()
  })

  it('includes app_name in context when set', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      appName: 'my-app',
    })

    const payload = toPayload(notice)

    expect(payload.context.app_name).toBe('my-app')
  })

  it('includes revision in context when set', () => {
    const error = new Error('Test error')
    const notice = createNotice(error, {
      revision: 'v1.2.3',
    })

    const payload = toPayload(notice)

    expect(payload.context.revision).toBe('v1.2.3')
  })

  it('omits app_name from context when not set', () => {
    const error = new Error('Test error')
    const notice = createNotice(error)

    const payload = toPayload(notice)

    expect(payload.context.app_name).toBeUndefined()
  })

  it('omits revision from context when not set', () => {
    const error = new Error('Test error')
    const notice = createNotice(error)

    const payload = toPayload(notice)

    expect(payload.context.revision).toBeUndefined()
  })
})
