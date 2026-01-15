import type { Context as KoaContext, Middleware, Next } from 'koa'
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
 * Koa middleware for Checkend error tracking
 *
 * Captures errors and sets up request context.
 */
export function middleware(): Middleware {
  return async (ctx: KoaContext, next: Next): Promise<void> => {
    await runWithContextAsync(async () => {
      const config = getConfiguration()

      // Set request context if enabled
      if (config?.sendRequestData !== false) {
        const requestInfo = extractRequestInfo(ctx)
        setRequest(requestInfo)
      }

      // Set basic context
      setContext({
        method: ctx.method,
        path: ctx.path,
        requestId: ctx.get('x-request-id') || ctx.get('x-correlation-id'),
      })

      // Extract user if available and enabled
      if (config?.sendUserData !== false) {
        const user = extractUser(ctx)
        if (user) {
          setUser(user)
        }
      }

      try {
        await next()
      } catch (err) {
        // Report the error to Checkend
        if (err instanceof Error) {
          notify(err, {
            tags: ['koa'],
          })
        }

        // Re-throw to let Koa handle the error
        throw err
      } finally {
        clear()
      }
    })
  }
}

/**
 * Error handler middleware for Koa
 *
 * Use this if you want a dedicated error handler instead of the all-in-one middleware.
 */
export function errorHandler(): Middleware {
  return async (ctx: KoaContext, next: Next): Promise<void> => {
    try {
      await next()
    } catch (err) {
      if (err instanceof Error) {
        notify(err, {
          request: extractRequestInfo(ctx),
          tags: ['koa'],
        })
      }
      throw err
    }
  }
}

/**
 * Extract request information from Koa context
 */
function extractRequestInfo(ctx: KoaContext): RequestInfo {
  return {
    url: ctx.originalUrl || ctx.url,
    method: ctx.method,
    path: ctx.path,
    query: ctx.querystring,
    headers: extractHeaders(ctx),
    params: (ctx as KoaContext & { params?: Record<string, unknown> }).params,
    body: (ctx.request as unknown as { body?: unknown }).body,
    remoteIp: extractRemoteIp(ctx),
    userAgent: ctx.get('user-agent'),
    referer: ctx.get('referer'),
    contentType: ctx.get('content-type'),
    contentLength: ctx.get('content-length'),
  }
}

/**
 * Extract and filter headers from request
 */
function extractHeaders(ctx: KoaContext): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const [key, value] of Object.entries(ctx.headers)) {
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
 * Extract remote IP address from context
 */
function extractRemoteIp(ctx: KoaContext): string | undefined {
  // Check common headers for real IP behind proxies
  const forwarded = ctx.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  return ctx.get('x-real-ip') || ctx.ip || ctx.socket.remoteAddress
}

/**
 * Extract user information from context
 */
function extractUser(ctx: KoaContext): User | undefined {
  // Check for common user properties on state
  const user = (ctx.state as { user?: unknown }).user

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
  middleware,
  errorHandler,
}
