import { readDatabaseConfig } from '@premiumpass/persistence';
import { handle } from '@hono/aws-lambda';
import { createApp } from './app.js';
import { readAuthConfig } from './config.js';
import { createPersistence } from './persistence.js';
import { readLogLevel } from '@premiumpass/logging';
import { createGoogleBilling } from './billing/google.js';

const database = readDatabaseConfig(process.env);

export const handler = handle(
  createApp({
    auth: readAuthConfig(process.env),
    stores: createPersistence(database),
    logLevel: readLogLevel(process.env),
    google: createGoogleBilling(process.env, database, false),
  }),
);
