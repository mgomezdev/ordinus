import pino from 'pino';
import { config } from './config.js';

function createLogger(): pino.Logger {
  if (config.NODE_ENV === 'development') {
    return pino({
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      level: config.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino({
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    level: config.LOG_LEVEL,
  });
}

export const logger = createLogger();
