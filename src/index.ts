import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { Logger as WinstonLogger } from 'winston';

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format;

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

/**
 * Console format: human-readable, colorized, single line + inline meta.
 * Kept cheap on purpose (no deep pretty-printing) so it stays fast under load.
 */
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  errors({ stack: true }),
  splat(),
  printf(({ level, message, timestamp: ts, reqId, stack, ...meta }) => {
    const metaKeys = Object.keys(meta).filter((k) => k !== 'service');
    const metaStr = metaKeys.length
      ? ' ' + JSON.stringify(meta, null, 0)
      : '';
    const reqTag = reqId ? ` [${reqId}]` : '';
    const base = `${ts} ${level}${reqTag}: ${message}${metaStr}`;
    return stack ? `${base}\n${stack}` : base;
  })
);

/**
 * File format: structured JSON, cheap to parse/ship to log aggregators
 * (ELK, Loki, CloudWatch, etc). No colorization — colors are ANSI noise in files.
 */
const fileFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json()
);

const transports: winston.transport[] = [];

// Console transport - always enabled
transports.push(
  new winston.transports.Console({
    format: consoleFormat,
  })
);

// File transports: skip in test env
if (!isTest) {
  // Ensure log directory exists
  try {
    const fs = await import('fs');
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch {
    // Directory creation failed, but we continue without file logging
  }

  transports.push(
    new winston.transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
    new winston.transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    })
  );
}

// Create the logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  format: fileFormat,
  defaultMeta: { service: process.env.SERVICE_NAME || 'redis-infrastructure' },
  transports,
  exitOnError: false,
});

// Surface transport-level errors
logger.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Logger transport error:', err);
});

// ============ Logger Wrapper Class (for compatibility) ============

export interface LoggerOptions {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  service?: string;
  environment?: string;
  pretty?: boolean;
}

export class Logger {
  private logger: WinstonLogger;
  private options: LoggerOptions;
  private childBindings: Record<string, any>;

  constructor(options: LoggerOptions = {}) {
    this.options = options;
    this.childBindings = {};

    // Create a child logger with service context
    const service = options.service || process.env.SERVICE_NAME || 'redis-infrastructure';
    this.logger = logger.child({ service });
  }

  child(bindings: Record<string, any>): Logger {
    const child = new Logger(this.options);
    child.logger = this.logger.child(bindings);
    child.childBindings = { ...this.childBindings, ...bindings };
    return child;
  }

  trace(msg: string, obj?: Record<string, any>): void {
    this.logger.debug(msg, { ...obj, level: 'trace' });
  }

  debug(msg: string, obj?: Record<string, any>): void {
    this.logger.debug(msg, obj);
  }

  info(msg: string, obj?: Record<string, any>): void {
    this.logger.info(msg, obj);
  }

  warn(msg: string, obj?: Record<string, any>): void {
    this.logger.warn(msg, obj);
  }

  error(msg: string, obj?: Record<string, any>): void {
    this.logger.error(msg, obj);
  }

  fatal(msg: string, obj?: Record<string, any>): void {
    this.logger.error(msg, { ...obj, fatal: true });
  }

  // For Winston compatibility
  getWinston(): WinstonLogger {
    return this.logger;
  }
}

export const createLogger = (options?: LoggerOptions): Logger => {
  return new Logger(options);
};

// Export the raw Winston logger as well
export { logger as winstonLogger };

export type AppLogger = WinstonLogger;
export default logger;
