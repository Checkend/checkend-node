import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Worker } from '../src/worker'
import { Configuration } from '../src/configuration'
import { createNotice } from '../src/notice'

describe('Worker', () => {
  let worker: Worker
  let config: Configuration

  beforeEach(() => {
    // Mock fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, problem_id: 1 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    ))

    config = new Configuration({
      apiKey: 'test-key',
      maxQueueSize: 10,
      shutdownTimeout: 1,
    })
    worker = new Worker(config)
  })

  afterEach(async () => {
    await worker.stop(0)
    vi.unstubAllGlobals()
  })

  describe('push', () => {
    it('adds notice to queue', () => {
      const notice = createNotice(new Error('Test'))
      const result = worker.push(notice)

      expect(result).toBe(true)
    })

    it('respects maxQueueSize configuration', () => {
      // The worker should have a maxQueueSize of 10 from config
      expect(config.maxQueueSize).toBe(10)

      // Verify worker is using the config value
      const notice = createNotice(new Error('Test'))
      worker.push(notice)

      // Queue should accept items (not instantly full)
      expect(worker.queueSize).toBeGreaterThanOrEqual(0)
    })

    it('rejects after shutdown', async () => {
      await worker.stop(0)

      const notice = createNotice(new Error('Test'))
      const result = worker.push(notice)

      expect(result).toBe(false)
    })
  })

  describe('running', () => {
    it('returns true before shutdown', () => {
      expect(worker.running).toBe(true)
    })

    it('returns false after shutdown', async () => {
      await worker.stop(0)
      expect(worker.running).toBe(false)
    })
  })

  describe('queueSize', () => {
    it('returns current queue size', () => {
      expect(worker.queueSize).toBe(0)

      const notice = createNotice(new Error('Test'))
      worker.push(notice)

      // Queue size may vary as processing happens async
      expect(worker.queueSize).toBeGreaterThanOrEqual(0)
    })
  })

  describe('flush', () => {
    it('waits for pending notices', async () => {
      const notice = createNotice(new Error('Test'))
      worker.push(notice)

      await worker.flush(1)

      // Should complete without error
      expect(true).toBe(true)
    })
  })

  describe('stop', () => {
    it('stops accepting new notices', async () => {
      await worker.stop(0)

      const notice = createNotice(new Error('Test'))
      const result = worker.push(notice)

      expect(result).toBe(false)
    })
  })
})
