import type { Configuration } from './configuration'
import type { Notice, ApiResponse, NoticePayload } from './types'
import { toPayload } from './notice'
import { VERSION } from './version'

const USER_AGENT = `@checkend/node/${VERSION} Node/${process.version}`

/**
 * HTTP client for sending error notices to the Checkend API.
 */
export class Client {
  private config: Configuration

  constructor(config: Configuration) {
    this.config = config
  }

  /**
   * Send a notice to the Checkend API
   */
  async sendNotice(notice: Notice): Promise<ApiResponse | null> {
    const payload = toPayload(notice)
    return this.send(payload)
  }

  /**
   * Send a payload to the Checkend API
   */
  async send(payload: NoticePayload): Promise<ApiResponse | null> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(this.config.ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Checkend-Ingestion-Key': this.config.apiKey,
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      return await this.handleResponse(response)
    } catch (e) {
      clearTimeout(timeoutId)

      if (e instanceof Error && e.name === 'AbortError') {
        this.logError('Request timeout')
      } else {
        this.logError(`Failed to send notice: ${e}`)
      }
      return null
    }
  }

  private async handleResponse(response: Response): Promise<ApiResponse | null> {
    const status = response.status

    if (status === 201) {
      const result = await response.json() as ApiResponse
      this.log(`Notice sent successfully: id=${result.id} problem_id=${result.problem_id}`)
      return result
    }

    const body = await response.text().catch(() => '')

    switch (status) {
      case 400:
        this.logWarn(`Bad request: ${body}`)
        break
      case 401:
        this.logError('Authentication failed - check your API key')
        break
      case 422:
        this.logWarn(`Invalid notice payload: ${body}`)
        break
      case 429:
        this.logWarn('Rate limited by server - backing off')
        break
      default:
        if (status >= 500) {
          this.logError(`Server error: ${status} - ${body}`)
        } else {
          this.logError(`Unexpected response: ${status} - ${body}`)
        }
    }

    return null
  }

  private log(message: string): void {
    this.config.logger.debug(message)
  }

  private logWarn(message: string): void {
    this.config.logger.warn(message)
  }

  private logError(message: string): void {
    this.config.logger.error(message)
  }
}
