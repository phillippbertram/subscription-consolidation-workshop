import { readDatabaseConfig } from '@premiumpass/persistence';
import { handle } from '@hono/aws-lambda';
import { createApp } from './app.js';
import { readAuthConfig } from './config.js';
import { createPersistence } from './persistence.js';
import { readLogLevel } from '@premiumpass/logging';
import { createGoogleBilling } from './billing/google.js';

const database = readDatabaseConfig(process.env);

export const handler = handle(
  createApp(
    readAuthConfig(process.env),
    createPersistence(database),
    readLogLevel(process.env),
    () => new Date(),
    { google: createGoogleBilling(process.env, database, false) },
  ),
);
