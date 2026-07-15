// src/types/pino-roll.d.ts
declare module 'pino-roll' {
  import { DestinationStream } from 'pino';

  interface PinoRollOptions {
    /** The file path where logs will be written */
    file: string;
    /** How often to roll the file: 'daily', 'hourly', or a custom number in milliseconds */
    frequency?: 'daily' | 'hourly' | number;
    /** Maximum size of the log file in bytes or human-readable format (e.g., '20m') */
    size?: string | number;
    /** Date format for log file names (e.g., 'YYYY-MM-DD') */
    dateFormat?: string;
    /** Number of days to keep old log files */
    keep?: number;
    /** Whether to compress old logs with gzip */
    compress?: boolean;
    /** Minimum log level for this transport */
    level?: string;
    /** Whether to sync writes immediately */
    async?: boolean;
  }

  /**
   * Create a rollable file destination stream for pino
   */
  function pinoRoll(options: PinoRollOptions): DestinationStream;

  export = pinoRoll;
}
