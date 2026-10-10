# Entscheidungen

Stand: 10. Oktober 2026. Dieses Dokument unterscheidet die festgelegte Projektrichtung von Umsetzungsvorschlägen. Detaillierte Abläufe stehen im [Projektplan](../PROJECT_PLAN.md); Arbeitsstatus steht im [Aufgabenplan](TASKS.md).

## Festgelegte Richtung

| ID | Entscheidung | Konsequenz |
|---|---|---|
| D01 | React Native und Auth0 | Echter mobiler Login; SDK benötigt einen nativen Development Build |
| D02 | Authentifizierung direkt im Backend | API Gateway ohne JWT-/Lambda-Authorizer; zentrale Token- und Scope-Prüfung im BFF |
| D03 | AWS Serverless mit TypeScript und CDK | HTTP API, Lambda, DynamoDB, SQS/DLQ und EventBridge bilden die Zielarchitektur |
| D04 | Stripe im Testmodus, Apple/Google zunächst Mocks | Kein Live-Billing und keine echte Store-Integration im Wochenendumfang |
| D05 | Zentrale Subscriptions und Entitlements | Zugriff richtet sich nach serverseitig berechneten Rechten über alle Provider |
| D06 | Kleines Hands-on-Projekt | Schrittweise umsetzen; keine zusätzliche Plattform oder Admin-Oberfläche aufbauen |
| D07 | Hono oder Fastify als HTTP-Framework | Die vorherige NestJS-Empfehlung wird nicht weiterverfolgt |

## Offene Framework-Auswahl

**Status: offen.** Die Präferenz Hono oder Fastify stammt vom Nutzer. Hono ist die aktuelle Empfehlung des Assistenten und noch keine bestätigte Auswahl.

Vor P01 entweder die Auswahl mit dem Nutzer treffen oder eine ausdrücklich delegierte Auswahl begründet dokumentieren. Erst danach das gewählte Framework im Projektplan und in diesem Dokument als entschieden markieren. Nicht beide Frameworks installieren oder vorsorglich eine austauschbare HTTP-Abstraktion bauen.

Unabhängig davon gilt: eine gemeinsame App-Definition, getrennte Einstiegspunkte für lokalen HTTP-Betrieb und Lambda, Domainlogik ohne Framework-Abhängigkeit. Der konkrete Lambda-Adapter wird anhand der gewählten Framework-Version geprüft.

## Umsetzungsvorschläge aus dem Plan

Diese Vorgaben sind die Arbeitsbasis für die Aufgaben, keine bereits vorhandene Implementierung. Routineanpassungen innerhalb des beauftragten Umfangs begründen und hier beziehungsweise im Projektplan nachziehen.

| Thema | Arbeitsbasis |
|---|---|
| Runtime | Node.js 24; kompatible genaue Versionen und Lockfile mit P01 |
| Paketverwaltung | pnpm-Workspace als Vorschlag; genaue Version mit P01 festlegen |
| JWT | Etablierte Bibliothek; `jose` ist empfohlen, keine eigene Kryptografie |
| Validierung und Tests | Zod und Vitest als Startpunkt; Verhalten statt Implementierungsdetails testen |
| Mobile | Expo Development Build, drei kleine Screens |
| Persistenz | Kleine DynamoDB-Demotabelle, Conditional Writes und Transaktionen |
| Zuverlässigkeit | Gemeinsamer Verarbeitungspfad, Inbox/Outbox, Retry/DLQ und Reconciliation |
| Deployment | Eine Dev-Stage; GitHub Actions mit OIDC im späteren CI/CD-Task |

Die im Projektplan beschriebene Grace Period, die kleinen Scan-basierten Abläufe und die Latenzziele sind bewusste Demoregeln. Sie dürfen nicht als Provider-Garantien oder Produktions-SLAs dargestellt werden.

## Noch benötigte Umgebung

| Information | Benötigt ab | Umgang bis dahin |
|---|---|---|
| Hono oder Fastify | P01 | Framework-unabhängige Dokumentation ist möglich |
| Genaue Toolchain-Versionen | P01 | Keine Installationsbefehle als vorhanden ausgeben |
| AWS-Account, Profil, Region | Live-Teil von P03 | CDK lokal synthetisieren und testen |
| Auth0-Issuer, API-Audience, Client-ID, Scopes | Live-Teil von P04 | Lokale Token- und JWKS-Fixtures für P02 |
| Primäre mobile Testplattform | P04 | Im mobilen Task festlegen und tatsächlich getestete Plattform dokumentieren |
| Stripe-Testpreis und Secret-Referenzen | P06 | Fixtures verwenden; keine fremden Zugangsdaten übernehmen |
| GitHub-Remote und OIDC-Ziel | P10 | Lokale Checks zuerst; keinen Remote erfinden |

Hier nur Konfigurationsnamen und nicht geheime Entscheidungen festhalten. Secret-Werte gehören nicht in dieses Dokument.
