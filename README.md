# PremiumPass

Hands-on-Lernprojekt: Eine React-Native-App mit Auth0 und einem AWS-Backend, das Stripe-Testabonnements sowie Apple-/Google-Mocks in zentrale Berechtigungen übersetzt. Es werden ausschließlich synthetische Daten verwendet.

## Orientierung

| Datei | Zweck |
|---|---|
| [AGENTS.md](AGENTS.md) | Arbeitsregeln für Coding-Agenten |
| [Projektplan](PROJECT_PLAN.md) | Fachlicher Umfang, Architektur, Wochenendplan und vollständige Testmatrix |
| [Entscheidungen](docs/DECISIONS.md) | Festgelegte Richtung, offene Auswahl und technische Vorschläge |
| [Aufgaben](docs/TASKS.md) | Kleine Arbeitspakete mit Abhängigkeiten, Status und Abnahme |

Der Projektordner ist die Arbeitsgrundlage. Frühere Library-Dateien sind Exporte eines damaligen Stands.

## Aktueller Einstieg

Das Repository enthält bisher die Projekt- und Agent-Dokumentation. Anwendungscode, Paketmanifest, Lockfile und Infrastruktur folgen mit den Implementierungsaufgaben. Der Aufgabenstatus steht im [Aufgabenplan](docs/TASKS.md).

Erster technischer Meilenstein: lokal startendes HTTP-Backend mit Health-Endpunkt, anschließend Auth0-Tokenprüfung und `GET /v1/me`. Danach folgt ein kleiner AWS-Durchlauf. Hono ist der aktuelle Vorschlag; die Nutzerpräferenz lässt Hono oder Fastify zu. Die Auswahl ist vor dem Backend-Skeleton zu dokumentieren.

## Lokale Vorbereitung

- Node.js 24 ist als Runtime geplant. Exakte Toolchain und Paketmanager-Version werden in P01 festgelegt und gepinnt.
- Ein Git-Repository ist bereits vorhanden. Remote, CI und Deployment sind noch nicht eingerichtet.
- Für die lokalen Auth-Tests reichen erzeugte Testschlüssel und ein kontrolliertes JWKS; echte Zugänge werden erst für den Live-Durchlauf benötigt.
- Für den späteren AWS-Test: Dev-Account/Profil und Region. Für Auth0: Tenant, Native Application und Custom API mit Audience.
- Keine Secrets in Aufgabenbeschreibungen oder Chat-Nachrichten kopieren. Nicht geheime IDs und die Namen benötigter Secrets reichen zur Konfiguration.

## Ausführbare Befehle

Derzeit bestehen nur Git- und Dokumentationsdateien. Zur Sichtung des Arbeitsstands:

```sh
git status --short
git diff --check
```

`git diff --check` erfasst keine ungetrackten neuen Dateien; diese zusätzlich lesen und prüfen. Es gibt noch keinen Installations-, Start-, Build- oder Testbefehl für eine Anwendung.

P01 ergänzt an dieser Stelle die tatsächlich vorhandenen Befehle einschließlich Arbeitsverzeichnis, benötigter Konfiguration und Checks. Die Scripts sollen lokalen Start, Typecheck, Lint, Tests und Build nachvollziehbar abdecken. CDK-Synthese und Deployment werden erst mit P03 dokumentiert.

## Eine Aufgabe an einen Agenten übergeben

Beispiel für den nächsten Implementierungsauftrag:

> Lies AGENTS.md, docs/DECISIONS.md und P01 in docs/TASKS.md. Bearbeite nur P01. Kläre die dort genannte Framework-Auswahl, sofern sie noch nicht entschieden oder an dich delegiert wurde. Prüfe das Ergebnis lokal und aktualisiere Aufgabenstatus sowie README-Befehle. Führe keine Cloud-Deployments aus.

Weitere Tasks analog über ihre ID beauftragen. Jeder Task nennt sein Ergebnis und seine Grenzen. Fehlende Live-Zugänge verhindern nicht, dass lokale Implementierung und Tests abgeschlossen werden.

## Grundlage der Agent-Anweisungen

Die kompakte `AGENTS.md` im Projektstamm folgt der [offiziellen Anleitung für Projektanweisungen](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Projektspezifische Fakten stehen in verlinkten Dokumenten, damit nicht der gesamte Projektplan bei jeder Aufgabe als Regelwerk gelesen werden muss.
