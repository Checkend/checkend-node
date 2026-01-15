import type { Request, Response, NextFunction, ErrorRequestHandler, RequestHandler } from 'express'
import {
  notify,
  setContext,
  setUser,
  setRequest,
  clear,
  runWithContext,
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
 * Express request handler middleware for setting up context
 *
 * Should be added early in the middleware chain.
 */
export function requestHandler(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    runWithContext(() => {
      const config = getConfiguration()

      // Set request context if enabled
      if (config?.sendRequestData !== false) {
        const requestInfo = extractRequestInfo(req)
        setRequest(requestInfo)
      }

      // Set basic context
      setContext({
        method: req.method,
        path: req.path,
        requestId: req.get('x-request-id') || req.get('x-correlation-id'),
      })

      // Extract user if available and enabled
      if (config?.sendUserData !== false) {
        const user = extractUser(req)
        if (user) {
          setUser(user)
        }
      }

      // Clear context after response is finished
      res.on('finish', () => {
        clear()
      })

      next()
    })
  }
}

/**
 * Express error handler middleware for capturing errors
 *
 * Should be added as the last error handler in the middleware chain.
 */
export function errorHandler(): ErrorRequestHandler {
  return (err: Error, _req: Request, _res: Response, next: NextFunction): void => {
    // Report the error to Checkend
    notify(err, {
      tags: ['express'],
    })

    // Pass to the next error handler
    next(err)
  }
}

/**
 * Wrap an async route handler to catch errors
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Extract request information from Express request
 */
function extractRequestInfo(req: Request): RequestInfo {
  return {
    url: req.originalUrl || req.url,
    method: req.method,
    path: req.path,
    query: req.query ? JSON.stringify(req.query) : undefined,
    headers: extractHeaders(req),
    params: req.params,
    body: req.body,
    remoteIp: extractRemoteIp(req),
    userAgent: req.get('user-agent'),
    referer: req.get('referer'),
    contentType: req.get('content-type'),
    contentLength: req.get('content-length'),
  }
}

/**
 * Extract and filter headers from request
 */
function extractHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const [key, value] of Object.entries(req.headers)) {
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
function extractRemoteIp(req: Request): string | undefined {
  // Check common headers for real IP behind proxies
  const forwarded = req.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  return req.get('x-real-ip') || req.ip || req.socket.remoteAddress
}

/**
 * Extract user information from request
 */
function extractUser(req: Request): User | undefined {
  // Check for common user properties
  const user = (req as Request & { user?: unknown }).user

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
  requestHandler,
  errorHandler,
  asyncHandler,
}
