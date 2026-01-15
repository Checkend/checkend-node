import type { Notice, Context, RequestInfo, User, NoticePayload, Notifier } from './types'
import { VERSION } from './version'

const MAX_BACKTRACE_LINES = 100
const MAX_MESSAGE_LENGTH = 10000

/**
 * Create a Notice from an Error object
 */
export function createNotice(
  error: Error,
  options: {
    context?: Context
    request?: RequestInfo
    user?: User
    fingerprint?: string
    tags?: string[]
    environment?: string
    rootPath?: string
    appName?: string
    revision?: string
  } = {}
): Notice {
  return {
    errorClass: error.name || 'Error',
    message: truncateMessage(error.message || 'Unknown error'),
    backtrace: parseBacktrace(error.stack, options.rootPath),
    fingerprint: options.fingerprint,
    tags: options.tags ?? [],
    context: options.context ?? {},
    request: options.request ?? {},
    user: options.user ?? {},
    environment: options.environment,
    occurredAt: new Date().toISOString(),
    appName: options.appName,
    revision: options.revision,
  }
}

/**
 * Convert a Notice to the API payload format
 */
export function toPayload(notice: Notice): NoticePayload {
  const notifier: Notifier = {
    name: '@checkend/node',
    version: VERSION,
    language: 'javascript',
    language_version: process.version,
  }

  return {
    error: {
      class: notice.errorClass,
      message: notice.message,
      backtrace: notice.backtrace,
      occurred_at: notice.occurredAt,
      fingerprint: notice.fingerprint,
      tags: notice.tags.length > 0 ? notice.tags : undefined,
    },
    context: {
      ...notice.context,
      ...(notice.environment ? { environment: notice.environment } : {}),
      ...(notice.appName ? { app_name: notice.appName } : {}),
      ...(notice.revision ? { revision: notice.revision } : {}),
    },
    request: notice.request,
    user: notice.user,
    notifier,
  }
}

/**
 * Parse a stack trace string into an array of frames
 */
function parseBacktrace(stack?: string, rootPath?: string): string[] {
  if (!stack) {
    return []
  }

  const lines = stack.split('\n')

  // Remove the first line if it's just the error message
  const frames = lines
    .filter((line) => {
      const trimmed = line.trim()
      return trimmed.startsWith('at ')
    })
    .map((line) => cleanBacktraceLine(line.trim(), rootPath))
    .slice(0, MAX_BACKTRACE_LINES)

  return frames
}

/**
 * Clean a backtrace line, replacing project root with placeholder
 */
function cleanBacktraceLine(line: string, rootPath?: string): string {
  if (!rootPath) return line
  return line.replace(rootPath, '[PROJECT_ROOT]')
}

/**
 * Truncate message to max length
 */
function truncateMessage(message: string): string {
  if (!message) return ''
  if (message.length <= MAX_MESSAGE_LENGTH) return message
  return `${message.substring(0, MAX_MESSAGE_LENGTH - 3)}...`
}
