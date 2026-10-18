# Agent instructions for PremiumPass

## Getting started

This repository contains PremiumPass, a hands-on learning project for React Native, Auth0, and an AWS subscription platform. Use synthetic data and Stripe test mode only.

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
- Always use braces for conditionals and loops. Separate logical phases with blank lines; keep related declarations, calls, and results together when they form one logical step. Prefer clear names and focused functions over decorative section comments. Run `pnpm format` to apply ESLint structure fixes and Prettier, then `pnpm check` to verify the result. Do not disable style rules to avoid formatting a file.

## Code as learning material

- Treat existing and future code as workshop/tutorial material. Prefer readable names, explicit control flow, and focused functions that a learner can follow over clever shortcuts or unnecessary abstractions.
- Add concise English comments where the reasoning is not obvious: why a step exists, why order matters, what invariant it protects, and how it connects to the next component. Do not narrate self-explanatory syntax or comment every line.
- Explain deliberate demo simplifications at the relevant implementation. Mention an alternative and why the simpler approach fits this project when that comparison helps understanding.
- Where a simplification matters for production, identify the concrete missing decision or requirement. Clearly distinguish current guarantees from future considerations; a comment is not authorization to implement production features.
- Keep explanations next to the code they describe and update them when behavior changes. Use a short function-level overview for multi-step flows and inline comments for individual decisions; avoid duplicating whole architecture guides.

## Architecture rules

- Auth0 handles login. Access token verification and scope checks run in the backend before protected handlers. Do not configure a JWT or Lambda authorizer in API Gateway.
- Use established JWT verification and a fixed Auth0 JWKS URL. Trust claims only after signature, issuer, audience, and time validation. Never merely decode tokens and accept their claims.
- Map users from validated `iss` and `sub`. Premium access also requires a valid entitlement; a scope alone is insufficient.
- The Stripe webhook verifies its own signature against unchanged request bytes. It requires no Auth0 token and acknowledges only after successful queue acceptance.
- Keep HTTP transport, domain logic, provider adapters, and persistence separate. SQS and scheduled handlers do not need an HTTP framework.
- The domain must not depend on HTTP requests or framework contexts. Use an injectable clock for time-dependent access rules.
- Duplicate and delayed events are normal. Store state, completion markers, and outbox entries atomically; reconciliation uses the same domain processing path.
- An ending subscription must not remove another valid grant belonging to the same user. Check expiration times during API access as well.
- A provider outage grants no additional access period. Existing access follows the limits defined in docs/PAYMENTS.md.

## Configuration and secrets

- Do not put real tokens, secrets, customer data, or full payment payloads in code, fixtures, documentation, or logs.
- Use placeholders in examples. Local secrets belong in ignored files; cloud secrets will later use Secrets Manager.
- Do not reuse credentials from other projects. Check accounts, profiles, and stage before authorized external changes.
- Do not simulate working authentication: mock verifiers and local JWKS fixtures are for isolated manual verification only, never a silent runtime fallback.

## Commands and verification

The pnpm workspace contains the Hono API. `pnpm check` runs formatting checks, linting, typechecking, and the build. Installation is documented in docs/GETTING_STARTED.md; everyday commands and cleanup are in docs/DEVELOPMENT.md. Cloud infrastructure starts with P03.

- Inspect `package.json`, the lockfile, and runtime pins first. Use that toolchain; do not switch package managers when installing dependencies.
- For backend changes, run typechecking, linting, and the build, and check relevant flows manually.
- For infrastructure, synthesize CDK and inspect the generated template. Successful synthesis is not a live deployment.
- For documentation changes, check relative links, task dependencies, decision status, and diff consistency. Do not add artificial application tests for prose changes.
- Check mobile screens using the defined manual flow; do not add a UI test suite for the demo.
- Missing credentials or infrastructure are specific limitations. Finish independently verifiable work and state which evidence remains outstanding.

## Handoffs and documentation maintenance

Maintain implementation task status exclusively in `docs/TASKS.md`, kept short: done, open, next step. Record dated, detailed verification evidence in `docs/history/EVIDENCE_LOG.md`. Mark a task complete only when its acceptance criteria are met. For partial progress, state exactly which verification is missing.

Update the smallest relevant set of documents: setup in `docs/GETTING_STARTED.md`, commands in `docs/DEVELOPMENT.md`, decisions in `docs/DECISIONS.md`, and technical behavior in the owning architecture, payment, or data-model guide. Keep goals and scope in the project plan. Repetition does not turn a recommendation into a confirmed decision.

Report the outcome, relevant files, checks actually performed, and remaining limitations concisely. Distinguish local checks, synthesis, live AWS evidence, and mobile checks. Never claim successful verification or deployment without evidence.

## Code review rules

Pay particular attention to unprotected user routes, unverified claims, purchases assigned to the wrong owner, entitlement grants based only on checkout redirects, prematurely completed events, lost updates across concurrent providers, and the crash window between persistence and event publication. Include formatting verification in automated checks.
