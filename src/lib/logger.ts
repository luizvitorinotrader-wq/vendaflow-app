type LogLevel = 'log' | 'warn' | 'error' | 'info';

class Logger {
  private isDev = import.meta.env.DEV;

  log(...args: any[]) {
    if (this.isDev) {
      console.log(...args);
    }
  }

  warn(...args: any[]) {
    if (this.isDev) {
      console.warn(...args);
    }
  }

  error(...args: any[]) {
    console.error(...args);
  }

  info(...args: any[]) {
    if (this.isDev) {
      console.info(...args);
    }
  }
}

export const logger = new Logger();
