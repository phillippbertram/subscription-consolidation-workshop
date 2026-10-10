# Agent instructions for PremiumPass

## Getting started

This repository contains a hands-on learning project for React Native, Auth0, and an AWS subscription platform. Work in the `schufa-lab` repository; the product name is PremiumPass. Use synthetic data and Stripe test mode only.

Read [README.md](README.md) first, followed by [docs/DECISIONS.md](docs/DECISIONS.md) and the assigned task in [docs/TASKS.md](docs/TASKS.md). Then read only the relevant sections of [PROJECT_PLAN.md](PROJECT_PLAN.md). Inspect the existing implementation and `git status --short` before making changes.

## Working rules

- Work on the current request. The task backlog is not blanket authorization to implement every task.
- Do not write automated tests or install a test framework for this learning project. Verify changes with typechecking, linting, builds, and appropriate manual requests.
- Keep changes small and cohesive. Add directories and abstractions only when the current task needs them.
- Distinguish confirmed decisions, recommendations, and open questions. Hono is the selected HTTP framework; pnpm workspaces define the planned repository structure. Toolchain versions are pinned in `.nvmrc` and `package.json`.
- Resolve routine issues within the assigned scope independently. Ask only when a material decision or authorization is missing; existing authorization remains valid.
- Preserve other people's changes. Do not commit, push, or create remote repositories without a corresponding request.
- Cloud deployments, Auth0/Stripe changes, and paid resources must be covered by the current request. Local implementation, manual checks, and CDK synthesis require no additional confirmation.
- Do not independently expand scope to real store purchases, additional products, complex platform abstractions, or production operation.
- Use English throughout the project: code, identifiers, comments, runtime messages, configuration examples, documentation, and task records. Keep existing technical identifiers and product names where appropriate.

## Architecture rules

- Auth0 handles login. Access token verification and scope checks run in the backend before protected handlers. Do not configure a JWT or Lambda authorizer in API Gateway.
- Use established JWT verification and a fixed Auth0 JWKS URL. Trust claims only after signature, issuer, audience, and time validation. Never merely decode tokens and accept their claims.
- Map users from validated `iss` and `sub`. Premium access also requires a valid entitlement; a scope alone is insufficient.
- The Stripe webhook verifies its own signature against unchanged request bytes. It requires no Auth0 token and acknowledges only after successful queue acceptance.
- Keep HTTP transport, domain logic, provider adapters, and persistence separate. SQS and scheduled handlers do not need an HTTP framework.
- The domain must not depend on HTTP requests or framework contexts. Use an injectable clock for time-dependent access rules.
- Duplicate and delayed events are normal. Store state, completion markers, and outbox entries atomically; reconciliation uses the same domain processing path.
- An ending subscription must not remove another valid grant belonging to the same user. Check expiration times during API access as well.
- A provider outage grants no additional access period. Existing access follows the limits defined in the project plan.

## Configuration and secrets

- Do not put real tokens, secrets, customer data, or full payment payloads in code, fixtures, documentation, or logs.
- Use placeholders in examples. Local secrets belong in ignored files; cloud secrets will later use Secrets Manager.
- Do not reuse credentials from other projects. Check accounts, profiles, and stage before authorized external changes.
- Do not simulate working authentication: mock verifiers and local JWKS fixtures are for isolated manual verification only, never a silent runtime fallback.

## Commands and verification

The pnpm workspace contains the Hono BFF. `pnpm check` runs formatting checks, linting, typechecking, and the build. Installation, startup, and individual commands are documented in the README. Cloud infrastructure starts with P03.

- Inspect `package.json`, the lockfile, and runtime pins first. Use that toolchain; do not switch package managers when installing dependencies.
- For backend changes, run typechecking, linting, and the build, and check relevant flows manually.
- For infrastructure, synthesize CDK and inspect the generated template. Successful synthesis is not a live deployment.
- For documentation changes, check relative links, task dependencies, decision status, and diff consistency. Do not add artificial application tests for prose changes.
- Check mobile screens using the defined manual flow; do not add a UI test suite for the demo.
- Missing credentials or infrastructure are specific limitations. Finish independently verifiable work and state which evidence remains outstanding.

## Handoffs and documentation maintenance

Maintain implementation task status exclusively in `docs/TASKS.md`. Mark a task complete only when its acceptance criteria are met. For partial progress, state exactly which verification is missing.

Update the smallest relevant set of documents: commands in the README, decisions in `docs/DECISIONS.md`, and domain or architecture changes in the project plan. Repetition does not turn a recommendation into a confirmed decision.

Report the outcome, relevant files, checks actually performed, and remaining limitations concisely. Distinguish local checks, synthesis, live AWS evidence, and mobile checks. Never claim successful verification or deployment without evidence.

## Code review rules

Pay particular attention to unprotected user routes, unverified claims, purchases assigned to the wrong owner, entitlement grants based only on checkout redirects, prematurely completed events, lost updates across concurrent providers, and the crash window between persistence and event publication. Include formatting verification in automated checks.
