import type { Configuration } from './configuration'
import type { Notice, NoticePayload } from './types'
import { Client } from './client'
import { toPayload } from './notice'

const SHUTDOWN = Symbol('SHUTDOWN')
const FLUSH = Symbol('FLUSH')

// Exponential backoff for throttling
const BASE_THROTTLE = 1.05
const MAX_THROTTLE = 100

type QueueItem = NoticePayload | typeof SHUTDOWN | { type: typeof FLUSH; resolve: () => void }

/**
 * Worker handles async sending of notices via a background queue.
 *
 * It maintains a queue of notices and sends them in the background,
 * implementing throttling on errors and graceful shutdown.
 */
export class Worker {
  private config: Configuration
  private queue: QueueItem[] = []
  private client: Client
  private processing = false
  private shutdown = false
  private throttle = 0

  constructor(config: Configuration) {
    this.config = config
    this.client = new Client(config)
  }

  /**
   * Push a notice onto the queue for async sending
   */
  push(notice: Notice): boolean {
    if (this.shutdown) {
      return false
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      this.config.logger.warn('Queue full, dropping notice')
      return false
    }

    const payload = toPayload(notice)
    this.queue.push(payload)
    this.processQueue()
    return true
  }

  /**
   * Shutdown the worker, waiting for pending notices
   */
  async stop(timeout?: number): Promise<void> {
    if (this.shutdown) return

    this.shutdown = true
    this.queue.push(SHUTDOWN)

    const timeoutMs = (timeout ?? this.config.shutdownTimeout) * 1000

    // Wait for queue to drain or timeout
    await Promise.race([
      this.waitForDrain(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])
  }

  /**
   * Flush the queue, blocking until all current notices are sent
   */
  async flush(timeout?: number): Promise<void> {
    const timeoutMs = (timeout ?? this.config.timeout) * 1000

    return new Promise((resolve) => {
      this.queue.push({ type: FLUSH, resolve })
      this.processQueue()

      // Timeout fallback
      setTimeout(resolve, timeoutMs)
    })
  }

  /**
   * Check if the worker is running
   */
  get running(): boolean {
    return !this.shutdown
  }

  /**
   * Get the current queue size
   */
  get queueSize(): number {
    return this.queue.length
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    while (this.queue.length > 0) {
      const item = this.queue.shift()!

      if (item === SHUTDOWN) {
        break
      }

      if (typeof item === 'object' && 'type' in item && item.type === FLUSH) {
        item.resolve()
        continue
      }

      await this.sendWithThrottle(item as NoticePayload)
    }

    this.processing = false
  }

  private async sendWithThrottle(payload: NoticePayload): Promise<void> {
    if (this.throttle > 0) {
      const delay = this.throttleDelay()
      await this.sleep(delay)
    }

    const result = await this.client.send(payload)

    if (result === null) {
      this.incThrottle()
    } else {
      this.decThrottle()
    }
  }

  private throttleDelay(): number {
    return Math.round((Math.pow(BASE_THROTTLE, this.throttle) - 1) * 1000)
  }

  private incThrottle(): void {
    this.throttle = Math.min(this.throttle + 1, MAX_THROTTLE)
  }

  private decThrottle(): void {
    this.throttle = Math.max(this.throttle - 1, 0)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private waitForDrain(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.queue.length === 0 && !this.processing) {
          resolve()
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    })
  }
}
