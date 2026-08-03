// src/utils/logger.ts
import { ENV } from '@/config/env';

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export const log = {
  debug: (...args: unknown[]) => LEVELS[ENV.LOG_LEVEL] <= 0 && console.debug('[DEBUG]', ...args),
  info:  (...args: unknown[]) => LEVELS[ENV.LOG_LEVEL] <= 1 && console.info('[INFO]', ...args),
  warn:  (...args: unknown[]) => LEVELS[ENV.LOG_LEVEL] <= 2 && console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => LEVELS[ENV.LOG_LEVEL] <= 3 && console.error('[ERROR]', ...args),
};