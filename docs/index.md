---
# Start page of the documentation site (apps/docs). VitePress renders the hero
# and the tiles from this frontmatter; GitHub shows only the content below.
layout: home

hero:
  name: PremiumPass
  text: Is this user Premium right now?
  tagline: Set up one subscription across the web, iOS, and Android, then test that every app gives the same answer. Stripe, App Store, and Google Play in test mode.
  actions:
    - theme: brand
      text: Set up the project
      link: /setup/
    - theme: alt
      text: How it works
      link: /concepts
    - theme: alt
      text: GitHub
      link: https://github.com/phillippbertram/subscription-consolidation-workshop

features:
  - title: Set up locally
    details: Run everything locally with Docker, Auth0, and Stripe test mode. One configuration file and a check after every step.
    link: /setup/workspace
    linkText: Workspace
  - title: Try it out
    details: 'Six scenarios with the result you should see: tokens, a purchase, several sources, duplicates, repair, and complimentary access.'
    link: /try-it/
    linkText: Test checklist
  - title: Go further
    details: The app on a simulator or iPhone, real store test purchases, and a deployment to AWS. Needs your own accounts.
    link: /setup/apple
    linkText: Apple + iOS app
  - title: How it works
    details: Translate every store, combine all grants, and check the clock on every request.
    link: /architecture
    linkText: Architecture
---

![PremiumPass at a glance: users pay on the website with Stripe, in the iPhone app through the App Store, or in the Android app through Google Play. The backend translates every store, combines all purchases, and checks the clock, so every app gives the same answer to the question: is this user Premium right now?](images/overview.svg)

> [!WARNING]
> **Work in progress.** The local web flow with Stripe test payments works end
> to end. Real Google Play and Apple Sandbox purchases and the AWS deployment
> are prepared but not fully verified yet. Details: [project status](TASKS.md).

## What this is not

- **Not a production payment system.** Stripe test mode, Apple Sandbox, and
  Google Play license tests only; all data is synthetic.
- **Not a library.** It is readable example code with comments that explain the
  _why_; copy ideas, not modules.
- **Not finished everywhere.** Which parts are verified locally or in AWS is
  tracked in the [project status](TASKS.md).
