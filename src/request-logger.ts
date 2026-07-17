// request-logger.ts
import { Logger } from './logger.js';

/**
 * Generic request context that can be adapted to any framework
 */
export interface RequestContext {
  id?: string;
  method?: string;
  url?: string;
  path?: string;
  query?: Record<string, any>;
  params?: Record<string, any>;
  headers?: Record<string, any>;
  body?: any;
  ip?: string;
  userAgent?: string;
  startTime?: number;
  statusCode?: number;
  statusMessage?: string;
  responseHeaders?: Record<string, any>;
  responseBody?: any;
  duration?: number;
  error?: Error;
}

/**
 * Request lifecycle events
 */
export enum RequestEvent {
  RECEIVED = 'request.received',
  STARTED = 'request.started',
  COMPLETED = 'request.completed',
  ERROR = 'request.error',
  RESPONSE = 'request.response',
}

/**
 * Framework-independent request logger
 */
export class RequestLogger {
  private logger: Logger;
  private context: RequestContext;
  private startTime: number;

  constructor(logger: Logger, context: RequestContext = {}) {
    this.logger = logger;
    this.context = {
      id: context.id || generateRequestId(),
      ...context,
    };
    this.startTime = Date.now();
  }

  /**
   * Set request details
   */
  setRequest(details: Partial<RequestContext>): this {
    this.context = { ...this.context, ...details };
    return this;
  }

  /**
   * Set response details
   */
  setResponse(details: Partial<RequestContext>): this {
    this.context = { ...this.context, ...details };
    return this;
  }

  /**
   * Log request received
   */
  logReceived(): void {
    const data = {
      event: RequestEvent.RECEIVED,
      ...this.getSanitizedContext(),
      timestamp: new Date().toISOString(),
    };
    // Use the logger's debug method with object first, then message
    this.logger.debug('Request received', data);
  }

  /**
   * Log request started
   */
  logStarted(): void {
    const data = {
      event: RequestEvent.STARTED,
      requestId: this.context.id,
      method: this.context.method,
      url: this.context.url || this.context.path,
      ip: this.context.ip,
      userAgent: this.context.userAgent,
    };
    this.logger.info( 'Request started', data );
  }

  /**
   * Log request completed
   */
  logCompleted(): void {
    const duration = Date.now() - this.startTime;
    const statusCode = this.context.statusCode || 200;
    const logLevel = statusCode >= 500 ? 'error' :
                     statusCode >= 400 ? 'warn' :
                     'info';

    const data = {
      event: RequestEvent.COMPLETED,
      requestId: this.context.id,
      statusCode,
      statusMessage: this.context.statusMessage,
      duration: `${duration}ms`,
      method: this.context.method,
      url: this.context.url || this.context.path,
    };

    // Use dynamic method call with proper typing
    this.logger[logLevel]( `Request completed with ${statusCode}`, data );
  }

  /**
   * Log response
   */
  logResponse(): void {
    const duration = Date.now() - this.startTime;

    const data = {
      event: RequestEvent.RESPONSE,
      requestId: this.context.id,
      statusCode: this.context.statusCode,
      statusMessage: this.context.statusMessage,
      duration: `${duration}ms`,
      responseHeaders: this.sanitizeHeaders(this.context.responseHeaders || {}),
      responseBody: this.truncateBody(this.context.responseBody),
    };
    this.logger.debug( 'Response sent', data );
  }

  /**
   * Log error
   */
  logError(error: Error | string, additionalContext?: Record<string, any>): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const duration = Date.now() - this.startTime;

    const data = {
      event: RequestEvent.ERROR,
      requestId: this.context.id,
      error: errorObj.message,
      stack: errorObj.stack,
      statusCode: this.context.statusCode || 500,
      duration: `${duration}ms`,
      method: this.context.method,
      url: this.context.url || this.context.path,
      ...additionalContext,
    };
    this.logger.error( `Request error: ${errorObj.message}`, data );
  }

  /**
   * Get the underlying logger (for custom logging)
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get child logger with request context
   */
  child(bindings: Record<string, any>): Logger {
    return this.logger.child({
      requestId: this.context.id,
      ...bindings,
    });
  }

  /**
   * Get sanitized context (removes sensitive data)
   */
  private getSanitizedContext(): Partial<RequestContext> {
    const { headers, body, ...rest } = this.context;
    return {
      ...rest,
      headers: headers ? this.sanitizeHeaders(headers) : undefined,
      body: body ? this.sanitizeBody(body) : undefined,
    };
  }

  /**
   * Sanitize headers (remove sensitive data)
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    if (!headers) return headers;

    const sanitized = { ...headers };
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'x-api-token',
      'api-key',
      'api-token',
    ];

    for (const header of sensitiveHeaders) {
      const key = Object.keys(sanitized).find(
        k => k.toLowerCase() === header.toLowerCase()
      );
      if (key) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Sanitize body (remove sensitive data)
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'passwordConfirmation',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
      'apiToken',
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field] !== undefined) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Truncate response body for logging
   */
  private truncateBody(body: any): any {
    if (!body) return body;

    try {
      const str = typeof body === 'string' ? body : JSON.stringify(body);
      const maxLength = 1000;

      if (str.length <= maxLength) {
        return typeof body === 'string' ? str : JSON.parse(str);
      }

      const truncated = str.substring(0, maxLength) + '... [truncated]';
      return truncated;
    } catch {
      return body;
    }
  }
}

/**
 * Factory function to create a request logger
 */
export function createRequestLogger(
  logger: Logger,
  context: RequestContext = {}
): RequestLogger {
  return new RequestLogger(logger, context);
}

/**
 * Middleware factory for Express
 */
export function expressRequestLogger(logger: Logger) {
  return (req: any, res: any, next: any) => {
    const requestLogger = new RequestLogger(logger, {
      id: req.headers['x-request-id'] || req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: req.headers,
      body: req.body,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    // Attach to request
    req.logger = requestLogger;
    req.requestId = requestLogger['context'].id;

    // Log request
    requestLogger.logReceived();
    requestLogger.logStarted();

    // Capture response
    let responseBody: any;

    // Override res.json, res.send, etc.
    const originalJson = res.json;
    res.json = function(body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    const originalSend = res.send;
    res.send = function(body: any) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    // Log on finish
    res.on('finish', () => {
      requestLogger.setResponse({
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        responseHeaders: res.getHeaders(),
        responseBody: responseBody,
      });

      requestLogger.logResponse();
      requestLogger.logCompleted();
    });

    // Log errors
    res.on('error', (error: Error) => {
      requestLogger.setResponse({
        statusCode: res.statusCode || 500,
      });
      requestLogger.logError(error);
    });

    next();
  };
}

/**
 * Middleware factory for Fastify
 */
export function fastifyRequestLogger(logger: Logger) {
  return (req: any, reply: any, done: any) => {
    const requestLogger = new RequestLogger(logger, {
      id: req.headers['x-request-id'] || req.id,
      method: req.method,
      url: req.url,
      path: req.routeOptions?.url,
      query: req.query,
      params: req.params,
      headers: req.headers,
      body: req.body,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    // Attach to request
    req.logger = requestLogger;
    req.requestId = requestLogger['context'].id;

    // Log request
    requestLogger.logReceived();
    requestLogger.logStarted();

    // Log on response
    reply.raw.on('finish', () => {
      requestLogger.setResponse({
        statusCode: reply.statusCode,
        statusMessage: reply.statusMessage,
        responseHeaders: reply.getHeaders(),
        responseBody: reply.payload,
      });

      requestLogger.logResponse();
      requestLogger.logCompleted();
    });

    // Log errors
    reply.raw.on('error', (error: Error) => {
      requestLogger.setResponse({
        statusCode: reply.statusCode || 500,
      });
      requestLogger.logError(error);
    });

    done();
  };
}

/**
 * Middleware factory for Koa
 */
export function koaRequestLogger(logger: Logger) {
  return async (ctx: any, next: any) => {
    const requestLogger = new RequestLogger(logger, {
      id: ctx.headers['x-request-id'] || ctx.requestId,
      method: ctx.method,
      url: ctx.url,
      path: ctx.path,
      query: ctx.query,
      params: ctx.params,
      headers: ctx.headers,
      body: ctx.request.body,
      ip: ctx.ip || ctx.request.ip,
      userAgent: ctx.headers['user-agent'],
    });

    // Attach to context
    ctx.logger = requestLogger;
    ctx.requestId = requestLogger['context'].id;

    // Log request
    requestLogger.logReceived();
    requestLogger.logStarted();

    try {
      await next();

      // Log response
      requestLogger.setResponse({
        statusCode: ctx.status,
        statusMessage: ctx.message,
        responseHeaders: ctx.response.headers,
        responseBody: ctx.body,
      });

      requestLogger.logResponse();
      requestLogger.logCompleted();
    } catch (error: any) {
      requestLogger.setResponse({
        statusCode: ctx.status || 500,
      });
      requestLogger.logError(error);
      throw error;
    }
  };
}

/**
 * Generic middleware for any framework (uses hooks/callbacks)
 */
export function createGenericRequestLogger(logger: Logger) {
  return {
    /**
     * Start logging a request
     */
    start(context: RequestContext): RequestLogger {
      const requestLogger = new RequestLogger(logger, context);
      requestLogger.logReceived();
      requestLogger.logStarted();
      return requestLogger;
    },

    /**
     * End logging a request
     */
    end(requestLogger: RequestLogger, context: Partial<RequestContext> = {}): void {
      requestLogger.setResponse(context);
      requestLogger.logResponse();
      requestLogger.logCompleted();
    },

    /**
     * Log an error
     */
    error(requestLogger: RequestLogger, error: Error | string, context: Record<string, any> = {}): void {
      requestLogger.logError(error, context);
    },
  };
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}
