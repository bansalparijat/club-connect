import { NextResponse } from 'next/server'

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 })
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  )
}

export const err = {
  badRequest: (msg: string, details?: Record<string, unknown>) =>
    errorResponse(400, 'VALIDATION_ERROR', msg, details),
  unauthorized: (msg = 'Unauthorized') =>
    errorResponse(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'Forbidden') =>
    errorResponse(403, 'FORBIDDEN', msg),
  notFound: (resource = 'Resource') =>
    errorResponse(404, 'NOT_FOUND', `${resource} not found`),
  conflict: (msg: string) =>
    errorResponse(409, 'ALREADY_EXISTS', msg),
  unprocessable: (msg: string) =>
    errorResponse(422, 'UNPROCESSABLE', msg),
  rateLimited: (msg = 'Too many requests') =>
    errorResponse(429, 'RATE_LIMITED', msg),
  internal: (msg = 'Internal server error') =>
    errorResponse(500, 'INTERNAL_ERROR', msg),
}
