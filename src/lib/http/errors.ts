import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonError(
  status: number,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    details ? { error: message, ...details } : { error: message },
    { status },
  );
}

export function badRequest(message: string) {
  return jsonError(400, message);
}

export function unauthorized(message = "Unauthorized.") {
  return jsonError(401, message);
}

export function forbidden(message = "Forbidden.") {
  return jsonError(403, message);
}

export function notFound(message: string) {
  return jsonError(404, message);
}

export function conflict(message: string, details?: Record<string, unknown>) {
  return jsonError(409, message, details);
}

export function internalServerError(message = "Internal server error.") {
  return jsonError(500, message);
}

export function handleRouteError(error: unknown) {
  if (error instanceof HttpError) {
    return jsonError(error.status, error.message, error.details);
  }

  if (error instanceof ZodError) {
    return badRequest(error.issues[0]?.message ?? "Invalid request.");
  }

  return internalServerError();
}
