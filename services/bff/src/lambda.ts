import { handle } from '@hono/aws-lambda';
import { createApp } from './app.js';
import { readAuthConfig } from './config.js';

export const handler = handle(createApp(readAuthConfig(process.env)));
