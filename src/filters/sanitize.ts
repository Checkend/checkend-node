const FILTERED = '[FILTERED]'
const TRUNCATE_LIMIT = 10000
const MAX_DEPTH = 10

/**
 * SanitizeFilter scrubs sensitive data from objects before sending.
 */
export class SanitizeFilter {
  private filterPattern: RegExp

  constructor(filterKeys: string[]) {
    this.filterPattern = this.buildPattern(filterKeys)
  }

  /**
   * Sanitize an object, scrubbing sensitive values
   */
  sanitize<T>(data: T): T {
    return this.process(this.deepClone(data), 0) as T
  }

  private process(obj: unknown, depth: number): unknown {
    if (depth > MAX_DEPTH) {
      return FILTERED
    }

    if (obj === null || obj === undefined) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.process(item, depth + 1))
    }

    if (obj instanceof Buffer) {
      return '[Buffer]'
    }

    if (typeof obj === 'object') {
      return this.processObject(obj as Record<string, unknown>, depth)
    }

    if (typeof obj === 'string') {
      return this.truncateString(obj)
    }

    return obj
  }

  private processObject(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const key of Object.keys(obj)) {
      if (this.shouldFilter(key)) {
        result[key] = FILTERED
      } else {
        result[key] = this.process(obj[key], depth + 1)
      }
    }

    return result
  }

  private shouldFilter(key: string): boolean {
    if (!key) return false
    return this.filterPattern.test(key.toLowerCase())
  }

  private buildPattern(keys: string[]): RegExp {
    if (keys.length === 0) {
      return /(?!)/ // Never match
    }

    const patterns = keys.map((k) => k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp(patterns.join('|'), 'i')
  }

  private truncateString(str: string): string {
    if (str.length <= TRUNCATE_LIMIT) {
      return str
    }
    return `${str.substring(0, TRUNCATE_LIMIT - 13)}...[TRUNCATED]`
  }

  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (obj instanceof Buffer) {
      return obj as T
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as T
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepClone(item)) as T
    }

    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      result[key] = this.deepClone((obj as Record<string, unknown>)[key])
    }
    return result as T
  }
}
