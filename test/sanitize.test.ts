import { describe, it, expect } from 'vitest'
import { SanitizeFilter } from '../src/filters/sanitize'

describe('SanitizeFilter', () => {
  const defaultFilterKeys = ['password', 'token', 'secret', 'apiKey']

  describe('sanitize', () => {
    it('filters matching keys in objects', () => {
      const filter = new SanitizeFilter(defaultFilterKeys)
      const data = {
        username: 'john',
        password: 'secret123',
        email: 'john@example.com',
      }

      const result = filter.sanitize(data)

      expect(result.username).toBe('john')
      expect(result.password).toBe('[FILTERED]')
      expect(result.email).toBe('john@example.com')
    })

    it('filters nested objects', () => {
      const filter = new SanitizeFilter(defaultFilterKeys)
      const data = {
        user: {
          name: 'john',
          credentials: {
            password: 'secret123',
          },
        },
      }

      const result = filter.sanitize(data)

      expect(result.user.name).toBe('john')
      expect(result.user.credentials.password).toBe('[FILTERED]')
    })

    it('filters arrays', () => {
      const filter = new SanitizeFilter(defaultFilterKeys)
      const data = {
        users: [
          { name: 'john', password: 'pass1' },
          { name: 'jane', password: 'pass2' },
        ],
      }

      const result = filter.sanitize(data)

      expect(result.users[0].name).toBe('john')
      expect(result.users[0].password).toBe('[FILTERED]')
      expect(result.users[1].password).toBe('[FILTERED]')
    })

    it('is case-insensitive', () => {
      const filter = new SanitizeFilter(defaultFilterKeys)
      const data = {
        Password: 'secret1',
        PASSWORD: 'secret2',
        pAsSwOrD: 'secret3',
      }

      const result = filter.sanitize(data)

      expect(result.Password).toBe('[FILTERED]')
      expect(result.PASSWORD).toBe('[FILTERED]')
      expect(result.pAsSwOrD).toBe('[FILTERED]')
    })

    it('truncates long strings', () => {
      const filter = new SanitizeFilter([])
      const longString = 'x'.repeat(15000)
      const data = { content: longString }

      const result = filter.sanitize(data)

      expect(result.content.length).toBeLessThan(longString.length)
      expect(result.content).toContain('[TRUNCATED]')
    })

    it('handles null and undefined', () => {
      const filter = new SanitizeFilter(defaultFilterKeys)
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        password: 'secret',
      }

      const result = filter.sanitize(data)

      expect(result.nullValue).toBeNull()
      expect(result.undefinedValue).toBeUndefined()
      expect(result.password).toBe('[FILTERED]')
    })

    it('handles Buffer objects', () => {
      const filter = new SanitizeFilter(defaultFilterKeys)
      const data = {
        buffer: Buffer.from('test'),
        password: 'secret',
      }

      const result = filter.sanitize(data)

      expect(result.buffer).toBe('[Buffer]')
      expect(result.password).toBe('[FILTERED]')
    })

    it('does not modify original data', () => {
      const filter = new SanitizeFilter(defaultFilterKeys)
      const data = { password: 'secret123' }

      filter.sanitize(data)

      expect(data.password).toBe('secret123')
    })

    it('handles deeply nested objects up to max depth', () => {
      const filter = new SanitizeFilter(defaultFilterKeys)
      let data: Record<string, unknown> = { value: 'test' }
      for (let i = 0; i < 15; i++) {
        data = { nested: data }
      }

      const result = filter.sanitize(data)

      // Should not throw, deeply nested values become [FILTERED]
      expect(result).toBeDefined()
    })
  })
})
