import { App, Tags } from 'aws-cdk-lib';
import { PremiumPassStack } from './stack.js';

const app = new App();
// No account lookups: account and region are selected only for a future deployment.
const stack = new PremiumPassStack(app, 'PremiumPassDev');
Tags.of(stack).add('Project', 'PremiumPass');
Tags.of(stack).add('Stage', 'dev');
