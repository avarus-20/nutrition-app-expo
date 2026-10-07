type Level = 'debug' | 'info' | 'warn' | 'error';

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

function log(level: Level, scope: string, message: string, data?: unknown) {
  if (isTest) return;
  if (level === 'debug' && !isDev) return;
  const line = `[${scope}] ${message}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (data === undefined) fn(line);
  else fn(line, data);
}

export const logger = {
  debug: (scope: string, message: string, data?: unknown) => log('debug', scope, message, data),
  info: (scope: string, message: string, data?: unknown) => log('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => log('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) => log('error', scope, message, data),
};
