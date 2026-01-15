import type { FastifyPluginCallback, FastifyRequest, FastifyReply, FastifyError } from 'fastify'
import {
  notify,
  setContext,
  setUser,
  setRequest,
  clear,
  runWithContextAsync,
  getConfiguration,
} from '../index'
import type { User, RequestInfo } from '../types'

// Headers that should be filtered from request data
const FILTERED_HEADERS = [
  'cookie',
  'authorization',
  'x-api-key',
  'x-auth-token',
]

// Headers to exclude entirely (not useful for debugging)
const EXCLUDED_HEADERS = [
  'host',
  'connection',
  'accept-encoding',
]

/**
 * Fastify plugin for Checkend error tracking
 *
 * @example
 * import Fastify from 'fastify'
 * import { plugin as checkendPlugin } from '@checkend/node/fastify'
 *
 * const fastify = Fastify()
 * fastify.register(checkendPlugin)
 */
export const plugin: FastifyPluginCallback = (fastify, _options, done) => {
  // Add request hook for context setup
  fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    await runWithContextAsync(async () => {
      const config = getConfiguration()

      // Set request context if enabled
      if (config?.sendRequestData !== false) {
        const requestInfo = extractRequestInfo(request)
        setRequest(requestInfo)
      }

      // Set basic context
      setContext({
        method: request.method,
        path: request.url,
        requestId: request.id,
      })

      // Extract user if available and enabled
      if (config?.sendUserData !== false) {
        const user = extractUser(request)
        if (user) {
          setUser(user)
        }
      }
    })
  })

  // Add response hook for cleanup
  fastify.addHook('onResponse', async (_request: FastifyRequest, _reply: FastifyReply) => {
    clear()
  })

  // Add error handler
  fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Report the error to Checkend
    notify(error, {
      request: extractRequestInfo(request),
      tags: ['fastify'],
    })

    // Send error response
    const statusCode = error.statusCode ?? 500
    reply.status(statusCode).send({
      error: error.name,
      message: error.message,
      statusCode,
    })
  })

  done()
}

/**
 * Error handler hook for manual registration
 *
 * Use this if you don't want to use the full plugin.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  notify(error, {
    request: extractRequestInfo(request),
    tags: ['fastify'],
  })

  const statusCode = error.statusCode ?? 500
  reply.status(statusCode).send({
    error: error.name,
    message: error.message,
    statusCode,
  })
}

/**
 * Extract request information from Fastify request
 */
function extractRequestInfo(request: FastifyRequest): RequestInfo {
  return {
    url: request.url,
    method: request.method,
    path: request.routeOptions?.url ?? request.url.split('?')[0],
    query: typeof request.query === 'string' ? request.query : JSON.stringify(request.query),
    headers: extractHeaders(request),
    params: request.params as Record<string, unknown>,
    body: request.body,
    remoteIp: extractRemoteIp(request),
    userAgent: request.headers['user-agent'],
    referer: request.headers['referer'] as string | undefined,
    contentType: request.headers['content-type'],
    contentLength: request.headers['content-length'],
  }
}

/**
 * Extract and filter headers from request
 */
function extractHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase()

    if (EXCLUDED_HEADERS.includes(lowerKey)) {
      continue
    }

    if (FILTERED_HEADERS.includes(lowerKey)) {
      headers[key] = '[FILTERED]'
    } else if (typeof value === 'string') {
      headers[key] = value
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ')
    }
  }

  return headers
}

/**
 * Extract remote IP address from request
 */
function extractRemoteIp(request: FastifyRequest): string | undefined {
  // Check common headers for real IP behind proxies
  const forwarded = request.headers['x-forwarded-for']
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded
    return ip.split(',')[0].trim()
  }

  const realIp = request.headers['x-real-ip']
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp
  }

  return request.ip ?? request.socket.remoteAddress
}

/**
 * Extract user information from request
 */
function extractUser(request: FastifyRequest): User | undefined {
  // Check for common user properties
  const user = (request as FastifyRequest & { user?: unknown }).user

  if (!user || typeof user !== 'object') {
    return undefined
  }

  const userObj = user as Record<string, unknown>

  const result: User = {}

  if ('id' in userObj) {
    result.id = userObj.id as string | number
  }
  if ('email' in userObj) {
    result.email = userObj.email as string
  }
  if ('name' in userObj) {
    result.name = userObj.name as string
  } else if ('fullName' in userObj) {
    result.name = userObj.fullName as string
  } else if ('displayName' in userObj) {
    result.name = userObj.displayName as string
  } else if ('username' in userObj) {
    result.name = userObj.username as string
  }

  return Object.keys(result).length > 0 ? result : undefined
}

export default {
  plugin,
  errorHandler,
}
