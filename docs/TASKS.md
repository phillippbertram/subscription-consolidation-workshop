# Aufgabenplan

Diese Datei ist die zentrale Stelle für den Arbeitsstatus. Umfang und fachliche Regeln stehen im [Projektplan](../PROJECT_PLAN.md), Entscheidungen in [DECISIONS.md](DECISIONS.md), Arbeitsregeln in [AGENTS.md](../AGENTS.md).

Aufgaben verwenden IDs `Pxx`. Die IDs `T01` bis `T22` im Projektplan bezeichnen Testfälle, keine Implementierungsaufgaben.

## Status und Reihenfolge

Erlaubte Statuswerte: `offen`, `in Arbeit`, `teilweise`, `erledigt`. Bei `teilweise` den konkret fehlenden Nachweis nennen. Eine lokale Prüfung erfüllt kein ausdrücklich gefordertes Live-Kriterium.

| ID | Aufgabe | Abhängigkeiten | Status |
|---|---|---|---|
| P00 | Projekt für Agenten vorbereiten | — | erledigt |
| P01 | Lokales HTTP-Grundgerüst | Framework-Auswahl | offen |
| P02 | Auth0-Tokenprüfung im Backend | P01 | offen |
| P03 | Kleiner AWS-Stack und Benutzerpersistenz | P01; für geschützten Live-Aufruf P02 | offen |
| P04 | Mobiler Login bis zum eigenen Profil | P02, P03 | offen |
| P05 | Fachliche Subscription- und Entitlement-Regeln | P01, P02, P03 | offen |
| P06 | Stripe-Kauf und verlässliche Verarbeitung | P02, P03, P05 | offen |
| P07 | Apple-/Google-Mocks | P05, P06 | offen |
| P08 | Outbox-Publisher und EventBridge | P06 | offen |
| P09 | Reconciliation und Ablauf | P07, P08 | offen |
| P10 | CI/CD, Betrieb und Abschlussdemo | P04, P06–P09 | offen |

**Nächster Auftrag:** P01. Die Framework-Auswahl ist offen; die Entscheidung oder ihre Delegation gehört zum Einstieg in diesen Task. Der Auftrag zur Agent-Vorbereitung führt P01 noch nicht aus.

## P00 Projekt für Agenten vorbereiten

**Ergebnis:** Ein Agent findet Projektregeln, bestätigte/offene Entscheidungen und eine kleine nächste Aufgabe.

**Umfang:** README, AGENTS.md, Entscheidungs- und Aufgabenplan; Projektplan auf die aktuelle Richtung bringen; Ignore- und Editor-Grundregeln.

**Abnahme:** Alle lokalen Dokumentationslinks lösen auf. Aufgabenabhängigkeiten sind widerspruchsfrei. Hono wird nicht als bereits bestätigt dargestellt. Keine erfundenen Start-/Testbefehle und kein Anwendungscode. Konfigurationsbeispiele bleiben versionierbar, lokale Secrets werden ignoriert.

**Nachweis vom 10. Oktober 2026:** 38 lokale Dokumentationslinks, Markdown-Struktur, Aufgaben-IDs und Abhängigkeiten geprüft. Ignore-Regeln mit `git check-ignore --no-index --stdin` für lokale Konfiguration und Beispieldateien geprüft. Neue Dateien separat auf Zeilenenden und Whitespace geprüft; `git diff --check` erfolgreich. Keine Anwendung implementiert oder ausgeführt.

## P01 Lokales HTTP-Grundgerüst

**Ergebnis:** Das gewählte Framework startet lokal und lässt sich über einen getrennten Lambda-Einstieg bauen.

**Umfang:** Auswahl Hono/Fastify dokumentieren; Node- und Paketmanager-Versionen pinnen; Workspace, TypeScript, Lint/Format und Testwerkzeug einrichten. Zunächst nur den benötigten BFF unter `services/bff` anlegen. Gemeinsame App-Factory, lokaler Einstieg, Lambda-Einstieg und öffentlicher `GET /health`. Abhängigkeiten per Lockfile fixieren; öffentliche Beispielkonfiguration ergänzen.

**Abnahme:** Installation anhand des README funktioniert. Lokaler Start und Health-Aufruf funktionieren. Typecheck, Lint, Formatprüfung, Build sowie ein HTTP-Smoke-Test sind erfolgreich. Fehlende Pflichtkonfiguration liefert eine verständliche Fehlermeldung. Die App-Factory öffnet beim Import keinen Port. Alle tatsächlichen Befehle stehen im README.

**Grenze:** Kein AWS-Deployment, keine Auth0-Konsole, keine mobile App und keine leeren Platzhalterpakete für spätere Features.

## P02 Auth0-Tokenprüfung im Backend

**Ergebnis:** Ein direkter Aufruf des BFF ist bereits durch die gemeinsame Auth-Komponente geschützt.

**Umfang:** JWT-Verifikation, fest konfiguriertes Issuer/Audience/Algorithmus-Profil, JWKS-Cache und Scope-Prüfung implementieren. `GET /v1/me` nutzt nur den geprüften Auth-Kontext. Bis P03 dürfen verifizierte Identitätsangaben ohne vorgetäuschte Persistenz geliefert werden. Öffentliche Health-Route explizit kennzeichnen.

**Abnahme:** Testfälle T01–T03 aus dem Projektplan direkt gegen den Handler bestehen. Zusätzlich fehlendes Ablaufdatum, manipulierte Signatur, unzulässiger Algorithmus, fremde Audience, unbekannter Schlüssel, Rotation und JWKS-Ausfall prüfen. Kein Fachhandler läuft bei abgewiesener Anfrage. Keine Tokenwerte im Log. Für lokale Tests erzeugte Schlüssel und kontrolliertes JWKS verwenden.

**Grenze:** Keine eigene Login-/Passwortverwaltung und kein API-Gateway-Authorizer. Auth0-Login bleibt extern; echte Credentials sind für diese lokalen Tests nicht nötig.

## P03 Kleiner AWS-Stack und Benutzerpersistenz

**Ergebnis:** Das HTTP-Backend läuft als Lambda hinter einer HTTP API; ein gültiger Aufruf erhält ein eigenes persistiertes Benutzerprofil.

**Umfang:** CDK-Stack für API, BFF, DynamoDB, Logs und eng begrenzte IAM-Rollen. Identität aus `iss`/`sub` auf interne User-ID abbilden. Wiederholte Erstaufrufe legen nicht mehrere Nutzer an. Kein Gateway-Authorizer. Deployment-Konfiguration und tatsächliche Befehle dokumentieren.

**Lokale Abnahme:** CDK-Synthese, Assertions für Ressourcen/Integration/IAM und Tests der Besitzerzuordnung bestehen. Secrets fehlen im Template.

**Live-Abnahme:** Im beauftragten Dev-Account deployen, Health und geschützten Aufruf prüfen; wiederholter Aufruf liefert dieselbe User-ID. Account, Region und geprüften Stack dokumentieren. Fehlt Zugang oder Deployment-Auftrag, lokalen Teil abschließen und Task als `teilweise` mit offenem Live-Nachweis führen.

## P04 Mobiler Login bis zum eigenen Profil

**Ergebnis:** Login → Auth0 → AWS-BFF → eigenes Profil ist auf einer benannten mobilen Plattform sichtbar.

**Umfang:** Kleine React-Native-App als Expo Development Build. Auth0-Anmeldung, SDK-Credentials-Verwaltung, Profilanzeige und Logout. Callback-/Logout-URLs und nicht geheime Konfigurationsnamen dokumentieren. Primäre Testplattform festlegen.

**Abnahme:** Echter Auth0-Login auf Simulator/Emulator oder Gerät, Profilabruf und Logout funktionieren. Nutzer B erhält sein eigenes Profil. Netzwerk-/Auth-Fehler werden angezeigt. Tokens stehen weder in AsyncStorage noch in Logs. Plattform und tatsächlich geprüfter Ablauf sind festgehalten.

**Grenze:** Keine Store-Käufe, kein UI-Designsystem und keine automatische Annahme, dass die zweite Plattform ebenfalls geprüft ist.

## P05 Fachliche Subscription- und Entitlement-Regeln

**Ergebnis:** Die Domain berechnet aus normalisierten Providerzuständen verlässliche Rechte.

**Umfang:** Modelle, Status-/Produktmapping und `deriveEntitlements(subscriptions, now)` nach Abschnitten 7–8 des Projektplans. Domain ohne HTTP-/AWS-Abhängigkeit. Free-/Premium-Lesemodell und geschützten Historienzugriff anschließen.

**Abnahme:** Tests für aktive Grants, Pending, periodische Kündigung, Ablauf, Widerruf, 24-Stunden-Grace nach zuvor gültigem Grant und mehrere Provider bestehen. Wiederholungen verlängern Grace nicht. Zeit wird injiziert. Unbekannte Produkte vergeben keine neuen Rechte. Die API-Integration von T04/T22 ist nachgewiesen.

**Grenze:** Keine echte Provider-Anbindung, keine Tarifwechsel oder Proration.

## P06 Stripe-Kauf und verlässliche Verarbeitung

**Ergebnis:** Ein echter Stripe-Testkauf führt über Webhook und SQS zu zentralen Berechtigungen.

**Umfang:** Kleine Test-Webseite mit Auth0, serverseitiges Customer-Mapping und idempotenter Checkout. Signierter Webhook, Arbeitsqueue/DLQ und Processor. Normalisierung sowie gemeinsame DynamoDB-Transaktion für Zustand, Entitlements, Abschlussmarkierung und Outbox. Revisionsbedingungen und Wiederholungen gehören zu diesem Task, nicht erst zur späteren Härtung.

**Abnahme:** T05–T12, T15–T18 im jeweils passenden lokalen/Live-Umfang nachweisen. Testkauf aktiviert Zugriff; manipulierter Webhook und fremde Kontozuordnung scheitern. Queue-Ausfall erzeugt kein Erfolgs-ACK. Duplikate und konkurrierende Updates verlieren oder vervielfachen keine Grants. Ein Fehler erreicht die DLQ und ist nach Korrektur wieder verarbeitbar.

**Grenze:** Outbox wird bereits geschrieben, aber ihr EventBridge-Publisher folgt in P08. Keine Live-Zahlungen. Bei fehlenden Testzugängen den lokalen Teil und die noch fehlenden Live-Fälle genau dokumentieren.

## P07 Apple-/Google-Mocks

**Ergebnis:** Zwei weitere Provider verwenden denselben fachlichen Verarbeitungsweg wie Stripe.

**Umfang:** Adapter und getrennte simulierte Provider-Zustände; Dev-Skript für Kauf, Verlängerung, Kündigung, Ablauf, Widerruf, falschen Besitzer und Ausfall. Ereignisauslösung muss abschaltbar sein.

**Abnahme:** Fixtures aus Abschnitt 10 sind reproduzierbar. T10–T15 bestehen auch mit Mocks. Das Ende eines Mock-Abos entzieht keine gültigen Rechte aus Stripe. Zustandsablage und lokales Subscription-Lesemodell sind unabhängig.

**Grenze:** Keine echten Apple-/Google-APIs. Dev-Hilfen erhalten keinen öffentlichen ungeschützten HTTP-Endpunkt.

## P08 Outbox-Publisher und EventBridge

**Ergebnis:** Gespeicherte fachliche Änderungen erreichen nachvollziehbar einen Event-Consumer.

**Umfang:** Publisher, stabiler Domain-Event-Identifier, EventBridge-Bus/Regel und Event-Log-Consumer. Offene Einträge bleiben bis zur bestätigten Annahme erhalten. Fehler bei Target-Zustellung und bei asynchroner Consumer-Ausführung getrennt sichtbar machen.

**Abnahme:** T19 prüft Teilfehler trotz HTTP 200 sowie Abbruch nach dem Senden. Wiederholung verliert keine Events; Duplikate sind an stabiler fachlicher ID erkennbar. Ein Live-Event lässt sich von der Outbox bis zum Consumer-Log verfolgen. Entitlement-Zugriff hängt nicht vom Event-Log-Consumer ab.

## P09 Reconciliation und Ablauf

**Ergebnis:** Verpasste Updates werden aus dem Provider-Zustand repariert.

**Umfang:** Periodischer und manuell auslösbarer Lauf, Pagination, Discovery über bekannte Stripe-Customer und Synchronisationsaufträge durch den vorhandenen Processor. Fällige Ablaufgrenzen berücksichtigen; keine zweite fachliche Implementierung.

**Abnahme:** T20–T22 bestehen. Ein unterdrücktes Mock-Event wird repariert; ein Stripe-Abo ohne initialen Webhook wird entdeckt. Provider-Ausfälle löschen keine bestehenden Zustände. Wiederholung desselben Laufs ist unschädlich. Das Sieben-Minuten-Demoziel unter gesunden Abhängigkeiten prüfen oder fehlenden Live-Nachweis nennen.

## P10 CI/CD, Betrieb und Abschlussdemo

**Ergebnis:** Änderungen sind reproduzierbar prüfbar und die Demo ist nachvollziehbar vorführbar.

**Umfang:** Vorhandene lokale Checks in GitHub Actions übernehmen, OIDC für die vereinbarte Dev-Stage, CloudWatch-Signale und Smoke-Tests. Den konkreten Repository-/Environment-Kontext für IAM verwenden. Kurzes Demo-Protokoll und Cleanup-Anleitung ergänzen.

**Abnahme:** Vollständige Testmatrix und Definition of Done aus Abschnitten 15/17 durchgehen. CI und ein autorisiertes Dev-Deployment nachweisen. DLQ/Redrive, Outbox und Reconciliation vorführen. Checklisten nur für tatsächlich bestandene Nachweise abhaken. Offene Punkte, getestete Plattform, Commit/Arbeitsstand und Datum dokumentieren.

**Grenze:** Keine Produktionsfreigabe und kein automatisch ausgeführtes destruktives Cleanup.

## Übergabeformat

Unter einer begonnenen Aufgabe einen kurzen Arbeitsvermerk ergänzen:

```text
Datum:
Status:
Umgesetzt:
Geprüft: konkreter Befehl oder manueller Ablauf und Ergebnis
Noch offen: fehlende Implementierung oder fehlender Nachweis
Nächster Schritt:
```

Keine Secrets oder kompletten Logs einfügen. Ein fehlender Zugang wird nicht als bestandene Prüfung und ein fertiges Dokument nicht als implementiertes System gewertet.
