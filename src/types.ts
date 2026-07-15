// import { DailyRotateFileTransportOptions } from "winston-daily-rotate-file";

// export interface LoggerOptions {
//   service?: string;

//   level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
//   environment?: "development"| "test" | "staging" | "production" ;

//   logDirectory?: string;

//   defaultMeta?: Record<string, unknown>;

//   console?: {
//     enabled?: boolean;
//     level?: string;
//   };

//   fileTransportOptions?: {
//     enabled?: boolean;
//     level?: Pick<DailyRotateFileTransportOptions, "level">;
//     maxSize?: Pick<DailyRotateFileTransportOptions, "maxSize">;
//     maxFiles?: Pick<DailyRotateFileTransportOptions, "maxFiles">;
//     zippedArchive?: Pick<DailyRotateFileTransportOptions, "zippedArchive">;
//     datePattern?: Pick<DailyRotateFileTransportOptions, "datePattern">;
//     filename?: Pick<DailyRotateFileTransportOptions, "filename">;
//     dirname?: Pick<DailyRotateFileTransportOptions, "dirname">;
//     // format?: Pick<DailyRotateFileTransportOptions, "format">;

//   };
// }


// types.ts
import { Level } from 'pino';

export interface LoggerOptions {
  /** Service name for the logger */
  service?: string;

  /** Log level */
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

  /** Environment where the logger is running */
  environment?: 'development' | 'test' | 'staging' | 'production';

  /** Directory where log files will be stored */
  logDirectory?: string;

  /** Default metadata to include with every log entry */
  defaultMeta?: Record<string, unknown>;

  /** Console transport configuration */
  console?: {
    /** Enable/disable console logging */
    enabled?: boolean;
    /** Console log level (overrides main level) */
    level?: Level;
    /** Pretty print options for development */
    pretty?: boolean | {
      colorize?: boolean;
      translateTime?: boolean | string;
      ignore?: string;
      singleLine?: boolean;
      messageFormat?: string;
    };
  };

  /** File transport configuration */
  fileTransportOptions?: {
    /** Enable/disable file logging */
    enabled?: boolean;
    /** Minimum log level for file transport */
    level?: Level;
    /** Maximum size of a log file before rotation (e.g., '20m', '10g', or bytes) */
    maxSize?: string | number;
    /** Number of days to keep log files */
    maxFiles?: number | string;
    /** Whether to compress rotated logs */
    zippedArchive?: boolean;
    /** Date pattern for rotation (e.g., 'yyyy-MM-DD') */
    datePattern?: string;
    /** Filename pattern */
    filename?: string;
    /** Directory for log files (overrides logDirectory) */
    file?: string;
    /** Whether to use asynchronous logging */
    async?: boolean;
    /** How often to roll the file: 'daily', 'hourly', or a custom number in milliseconds */
    frequency?: 'daily' | 'hourly' | number;
  };
}

// Export pino's Level type for convenience
export type { Level } from 'pino';
