// logger.ts
import pino, {
  Logger as PinoLogger,
  LoggerOptions as PinoLoggerOptions,
  DestinationStream,
  Level,
  stdTimeFunctions,
  Bindings
} from 'pino';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { LoggerOptions } from './types.js';

// ============ Pino Configuration ============

/**
 * Get console transport configuration
 */
const getConsoleTransport = (options: LoggerOptions['console'] = {}, level: Level) => {
  const isProd = process.env.NODE_ENV === 'production';
  const enabled = options?.enabled !== false;

  if (!enabled) {
    return null;
  }

  const consoleLevel = options?.level || level;

  if (isProd || options?.pretty === false) {
    // Production: JSON lines for log aggregation
    return pino.transport({
      target: 'pino/file',
      options: {
        destination: 1, // stdout
        sync: true,
      },
    });
  } else {
    // Development: pretty printed logs
    const prettyOptions = typeof options?.pretty === 'object'
      ? options.pretty
      : {};

    return pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: true,
        messageFormat: '{msg}',
        errorLikeObjectKeys: ['err', 'error'],
        ...prettyOptions,
      },
    });
  }
};

/**
 * Create a file write stream with simple rotation
 */
const createRotatingFileStream = (logDir: string, filename: string, isTest: boolean, maxSize: string = '20m', maxFiles: string = '14d'): DestinationStream | null => {
  if (isTest) return null;

  // Ensure log directory exists
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create log directory:', error);
    return null;
  }

  const filepath = path.join(logDir, filename);

  try {
    // Use pino's file transport
    const transport = pino.transport({
      target: 'pino/file',
      options: {
        destination: filepath,
        mkdir: true,
        sync: false,
      },
    });

    return transport;
  } catch (error) {
    console.error('Failed to create file transport:', error);
    return null;
  }
};

// ============ Main Logger Creation ============

export const createPinoLogger = (options: LoggerOptions = {}) => {
  const service = options.service ?? process.env.SERVICE ?? process.env.SERVICE_NAME ?? 'unknown';
  const environment = options.environment ?? process.env.NODE_ENV ?? 'development';
  const isProd = environment === 'production';
  const isTest = environment === 'test';
  const LOG_DIR = options.logDirectory || process.env.LOG_DIR || path.join(process.cwd(), 'logs');
  const level = options.level || (isProd ? 'info' : 'debug');

  // Base logger options
  const loggerOptions: PinoLoggerOptions = {
    name: service,
    level: level,
    base: {
      service,
      pid: process.pid,
      hostname: os.hostname(),
      environment,
      ...options.defaultMeta,
    },
    formatters: {
      level: (label: string) => ({ level: label }),
      bindings: (bindings: Record<string, any>) => {
        const { pid, hostname, name, ...rest } = bindings;
        return { pid, hostname, service: name, ...rest };
      },
    },
    timestamp: stdTimeFunctions.isoTime,
    errorKey: 'error',
    messageKey: 'msg',
    nestedKey: 'payload',
  };

  // Build transports
  const streams: DestinationStream[] = [];

  // Console transport
  const consoleTransport = getConsoleTransport(options.console, level as Level);
  if (consoleTransport) {
    streams.push(consoleTransport);
  }

  // File transport (if not in test and enabled)
  if (!isTest && options.fileTransportOptions?.enabled !== false) {
    const appLogStream = createRotatingFileStream(
      LOG_DIR,
      'app.log',
      isTest
    );
    if (appLogStream) {
      streams.push(appLogStream);
    }

    // Error file transport
    const errorLogStream = createRotatingFileStream(
      LOG_DIR,
      'error.log',
      isTest
    );
    if (errorLogStream) {
      streams.push(errorLogStream);
    }
  }

  // If no streams, fallback to basic pino
  if (streams.length === 0) {
    return pino(loggerOptions);
  }

  // Create multi-stream logger
  const streamEntries = streams.map(stream => ({
    stream,
    level: level,
  }));

  const logger = pino(loggerOptions, pino.multistream(streamEntries));
  // Manually flush on exit
  process.once('exit', () => {
    logger.flush();
  });

  // For SIGINT/SIGTERM, use once instead of on
  process.once('SIGINT', () => {
    logger.flush();
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    logger.flush();
    process.exit(0);
  });
  return logger
};

// ============ Logger Wrapper Class ============

export class Logger {
  private logger: PinoLogger;
  private options: LoggerOptions;
  private childBindings: Record<string, any>;

  constructor(options: LoggerOptions = {}) {
    this.options = options;
    this.childBindings = {};
    this.logger = createPinoLogger(options);
  }

  /**
   * Get the current log level
   */
  get level(): Level {
    return this.logger.level as Level;
  }

  /**
   * Set the log level
   */
  set level(level: Level) {
    this.logger.level = level;
  }

  /**
   * Create a child logger with additional bindings
   */
  child(bindings: Bindings): Logger {
    const child = new Logger(this.options);
    child.logger = this.logger.child(bindings);
    child.childBindings = { ...this.childBindings, ...bindings };
    return child;
  }

  /**
   * Trace level
   */
  trace(msg: string, obj?: Record<string, any>): void {
    this.logger.trace(obj || {}, msg);
  }

  /**
   * Debug level
   */
  debug(msg: string, obj?: Record<string, any>): void {
    this.logger.debug(obj || {}, msg);
  }

  /**
   * Info level
   */
  info(msg: string, obj?: Record<string, any>): void {
    this.logger.info(obj || {}, msg);
  }

  /**
   * Warn level
   */
  warn(msg: string, obj?: Record<string, any>): void {
    this.logger.warn(obj || {}, msg);
  }

  /**
   * Error level
   */
  error(msg: string, obj?: Record<string, any>): void {
    this.logger.error(obj || {}, msg);
  }

  /**
   * Fatal level
   */
  fatal(msg: string, obj?: Record<string, any>): void {
    this.logger.fatal({ ...obj, fatal: true }, msg);
  }

  /**
   * Silent level
   */
  silent(): void {
    this.logger.level = 'silent';
  }

  /**
   * Check if a given level is enabled
   */
  isLevelEnabled(level: Level): boolean {
    return this.logger.isLevelEnabled(level);
  }

  /**
   * Get the underlying pino logger
   */
  getPino(): PinoLogger {
    return this.logger;
  }

  /**
   * Flush all log entries
   */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.flush();
      setImmediate(resolve);
    });
  }
}

// ============ Factory Functions ============

export function createLogger(options: LoggerOptions = {}): Logger {
  const logDir = options.logDirectory ?? path.join(process.cwd(), 'logs');
  return new Logger({ ...options, logDirectory: logDir });
}

/**
 * Create a logger with a specific service name
 */
export function createServiceLogger(service: string, options: LoggerOptions = {}): Logger {
  return new Logger({ ...options, service });
}

// /**
//  * Create a logger with request context
//  */
// export function createRequestLogger(req: any, logger: Logger): Logger {
//   const reqId = req.id || req.headers?.['x-request-id'] || generateRequestId();
//   return logger.child({
//     reqId,
//     reqMethod: req.method,
//     reqUrl: req.url,
//     reqIp: req.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress,
//     reqUserAgent: req.headers?.['user-agent'],
//   });
// }

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

// ============ Default Export ============

const defaultLogger = new Logger({
  service: process.env.SERVICE_NAME || process.env.SERVICE || 'unknown',
});

export default defaultLogger;

// Export types
export type { PinoLogger, PinoLoggerOptions, Level, Bindings };
export type AppLogger = PinoLogger;
export type { LoggerOptions } from './types.js';
