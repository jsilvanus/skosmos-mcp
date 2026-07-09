type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private readonly minLevel: number;

  constructor(level: LogLevel = 'info') {
    this.minLevel = LOG_LEVELS[level] ?? LOG_LEVELS['info'];
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if ((LOG_LEVELS[level] ?? 0) < this.minLevel) return;
    const entry: Record<string, unknown> = {
      level,
      timestamp: new Date().toISOString(),
      message,
      ...context,
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }
}

function getLogLevel(): LogLevel {
  const raw = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

export const logger = new Logger(getLogLevel());
