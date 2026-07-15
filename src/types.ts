import { DailyRotateFileTransportOptions } from "winston-daily-rotate-file";

export interface LoggerOptions {
  service?: string;

  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  environment?: "development"| "test" | "staging" | "production" ;

  logDirectory?: string;

  defaultMeta?: Record<string, unknown>;

  console?: {
    enabled?: boolean;
    level?: string;
  };

  fileTransportOptions?: {
    enabled?: boolean;
    level?: Pick<DailyRotateFileTransportOptions, "level">;
    maxSize?: Pick<DailyRotateFileTransportOptions, "maxSize">;
    maxFiles?: Pick<DailyRotateFileTransportOptions, "maxFiles">;
    zippedArchive?: Pick<DailyRotateFileTransportOptions, "zippedArchive">;
    datePattern?: Pick<DailyRotateFileTransportOptions, "datePattern">;
    filename?: Pick<DailyRotateFileTransportOptions, "filename">;
    dirname?: Pick<DailyRotateFileTransportOptions, "dirname">;
    // format?: Pick<DailyRotateFileTransportOptions, "format">;

  };
}
