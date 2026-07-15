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

// Import pino-roll differently
import pinoRoll from 'pino-roll';



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
        translateTime: 'yyyy-mm-dd HH:MM:ss.l', // Fixed: use 'yyyy' instead of 'YYYY'
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
 * Create a file write stream for pino
 */
const createFileStream = (filepath: string): DestinationStream | null => {
  try {
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create a write stream
    const stream = fs.createWriteStream(filepath, {
      flags: 'a',
      encoding: 'utf8'
    });

    // Return as DestinationStream
    return stream as DestinationStream;
  } catch (error) {
    console.error('Failed to create file stream:', error);
    return null;
  }
};

/**
 * Get file transport with rotation using pino-roll
 */
const getFileTransport = (logDir: string, options: LoggerOptions['fileTransportOptions'] = {}, isTest: boolean) => {
  if (isTest || options?.enabled === false) return null;

  const dirname = options?.file || logDir;
  const filename = options?.filename || 'app.log';
  const frequency = options?.frequency || 'daily';
  const datePattern = options?.datePattern || 'yyyy-MM-dd'; // Fixed: use 'yyyy-MM-dd'
  const maxSize = options?.maxSize || '20m';
  const maxFiles = options?.maxFiles || '14d';
  const compress = options?.zippedArchive !== false;
  const level = options?.level;

  const filepath = path.join(dirname, filename);

  try {
    // Create the file transport using pino-roll
    const stream = pinoRoll({
      file: filepath,
      frequency,
      dateFormat: datePattern,
      size: maxSize,
      keep: typeof maxFiles === 'string' && maxFiles.endsWith('d')
        ? parseInt(maxFiles)
        : 14,
      compress,
      level: level || undefined,
    });

    // Ensure it's a valid stream
    if (!stream || typeof stream.write !== 'function') {
      console.error('Invalid stream returned from pino-roll');
      return null;
    }

    return stream;
  } catch (error) {
    console.error('Failed to create file log transport:', error);
    return null;
  }
};

/**
 * Get error file transport
 */
const getErrorFileTransport = (logDir: string, options: LoggerOptions['fileTransportOptions'] = {}, isTest: boolean) => {
  if (isTest || options?.enabled === false) return null;

  try {
    const dirname = options?.file || logDir;
    const maxFiles = options?.maxFiles || '30d';
    const maxSize = options?.maxSize || '20m';
    const compress = options?.zippedArchive !== false;

    const filepath = path.join(dirname, 'error.log');

    const stream = pinoRoll({
      file: filepath,
      frequency: 'daily',
      size: maxSize,
      keep: typeof maxFiles === 'string' && maxFiles.endsWith('d')
        ? parseInt(maxFiles)
        : 30,
      compress,
      level: 'error',
    });

    return stream;
  } catch (error) {
    console.error('Failed to create error log transport:', error);
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
    const fileTransport = getFileTransport(LOG_DIR, options.fileTransportOptions, isTest);
    if (fileTransport) {
      streams.push(fileTransport);
    }

    // Error file transport (always enabled for errors)
    const errorTransport = getErrorFileTransport(LOG_DIR, options.fileTransportOptions, isTest);
    if (errorTransport) {
      streams.push(errorTransport);
    }
  }

  // If no streams, fallback to basic pino
  if (streams.length === 0) {
    return pino(loggerOptions);
  }

  // Create multi-stream logger with proper stream entries
  const streamEntries = streams.map(stream => ({
    stream,
    level: level,
  }));

  return pino(loggerOptions, pino.multistream(streamEntries));
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

/**
 * Create a logger with request context
 */
export function createRequestLogger(req: any, logger: Logger): Logger {
  const reqId = req.id || req.headers?.['x-request-id'] || generateRequestId();
  return logger.child({
    reqId,
    reqMethod: req.method,
    reqUrl: req.url,
    reqIp: req.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress,
    reqUserAgent: req.headers?.['user-agent'],
  });
}

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
