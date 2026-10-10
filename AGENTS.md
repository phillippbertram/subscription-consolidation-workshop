# Agent-Anweisungen für PremiumPass

## Einstieg

Dieses Repository enthält ein Hands-on-Lernprojekt für React Native, Auth0 und eine AWS-Subscription-Plattform. Arbeite im Repository `schufa-lab`; der Produktname ist PremiumPass. Verwende synthetische Daten und Stripe ausschließlich im Testmodus.

Lies zuerst [README.md](README.md), dann [docs/DECISIONS.md](docs/DECISIONS.md) und die beauftragte Aufgabe in [docs/TASKS.md](docs/TASKS.md). Lies aus [PROJECT_PLAN.md](PROJECT_PLAN.md) anschließend nur die dafür relevanten Abschnitte. Prüfe vorhandene Implementierung und `git status --short`, bevor du Änderungen machst.

## Arbeitsweise

- Bearbeite den aktuellen Auftrag. Der Aufgabenplan ist keine pauschale Beauftragung aller Aufgaben.
- Halte Änderungen klein und fachlich zusammenhängend. Lege Verzeichnisse und Abstraktionen erst an, wenn die aktuelle Aufgabe sie benötigt.
- Unterscheide bestätigte Entscheidungen, Empfehlungen und offene Punkte. Hono ist empfohlen; die Auswahl zwischen Hono und Fastify ist noch nicht entschieden. NestJS ist nicht die gewünschte Richtung.
- Behebe Routineprobleme im beauftragten Umfang selbstständig. Frage nur bei einer wesentlichen fehlenden Entscheidung oder tatsächlich fehlender Autorisierung; bereits erteilte Autorisierung gilt weiter.
- Bewahre fremde Änderungen. Keine Commits, Pushes oder Remote-Repositories ohne entsprechenden Auftrag.
- Cloud-Deployments, Änderungen an Auth0/Stripe und kostenpflichtige Ressourcen müssen vom aktuellen Auftrag abgedeckt sein. Lokales Implementieren, Tests und CDK-Synthese benötigen keine zusätzliche Rückfrage.
- Keine eigenständige Erweiterung um echte Store-Käufe, zusätzliche Produkte, komplexe Plattformabstraktionen oder Produktionsbetrieb.
- Dokumentation und Ergebnisberichte auf Deutsch; Codebezeichner auf Englisch.

## Architekturregeln

- Auth0 übernimmt den Login. Access-Token-Verifikation und Scope-Prüfung erfolgen im Backend, vor geschützten Handlern. Kein JWT- oder Lambda-Authorizer am API Gateway.
- Nutze etablierte JWT-Verifikation und die fest konfigurierte Auth0-JWKS-Adresse. Vertrauen entsteht erst nach Signatur-, Issuer-, Audience- und Zeitprüfung. Niemals Tokens nur dekodieren und Claims übernehmen.
- Benutzerzuordnung erfolgt aus validiertem `iss` und `sub`. Premiumzugriff verlangt zusätzlich ein gültiges Entitlement; ein Scope allein reicht nicht.
- Der Stripe-Webhook besitzt eigene Signaturprüfung über unveränderte Request-Bytes. Er benötigt kein Auth0-Token und bestätigt erst nach erfolgreicher Queue-Annahme.
- HTTP-Transport, Domainlogik, Provider-Adapter und Persistenz bleiben getrennt. SQS-/Zeitplan-Handler benötigen kein HTTP-Framework.
- Die Domain kennt weder HTTP-Requests noch Framework-Kontexte. Zeitabhängige Berechtigungen erhalten eine injizierbare Uhr.
- Doppelte und verspätete Events sind Normalfälle. Zustand, Abschlussmarkierung und Outbox werden atomar gespeichert; Reconciliation nutzt denselben fachlichen Verarbeitungspfad.
- Ein endendes Abo darf andere gültige Grants desselben Nutzers nicht löschen. Ablaufzeiten werden auch beim API-Zugriff geprüft.
- Ein Provider-Ausfall gewährt keine neue Laufzeit. Bestehende Rechte folgen den im Projektplan festgelegten Grenzen.

## Konfiguration und Geheimnisse

- Keine echten Tokens, Secrets, Kundendaten oder vollständigen Zahlungs-Payloads in Code, Fixtures, Dokumentation oder Logs.
- Beispiele enthalten Platzhalter. Lokale Geheimnisse gehören in ignorierte Dateien; Cloud-Secrets später in Secrets Manager.
- Keine bestehenden Zugangsdaten aus anderen Projekten übernehmen. Prüfe Accounts, Profile und Stage vor autorisierten externen Änderungen.
- Keine funktionierende Authentifizierung vortäuschen: Test-Verifier und lokale JWKS-Fixtures sind nur für Tests, nicht als stiller Laufzeit-Fallback.

## Befehle und Prüfung

Aktuell gibt es noch keine Anwendung, kein Paketmanifest und keine Build-/Test-Scripts. Erfinde keine vorhandenen Befehle. Die ausführbaren Befehle werden mit P01 eingeführt und im README dokumentiert.

- Prüfe später zunächst `package.json`, Lockfile und Runtime-Pinning. Verwende deren Toolchain; installiere Abhängigkeiten nicht mit wechselnden Paketmanagern.
- Für Backend-Änderungen: relevante Domain-/Auth-/Integrationstests, Typecheck, Lint und Build ausführen, soweit eingerichtet.
- Für Infrastruktur: CDK-Synthese und passende Assertions; ein erfolgreiches Synthese-Ergebnis ist kein Live-Deployment.
- Für reine Dokumentation: relative Links, Aufgabenabhängigkeiten, Entscheidungsstatus und Diff auf Konsistenz prüfen. Keine künstlichen Anwendungstests für Prosaänderungen anlegen.
- Mobile Screens zunächst anhand des definierten manuellen Ablaufs prüfen; keine umfangreiche UI-Testsuite für die Demo.
- Fehlende Credentials oder Infrastruktur sind konkrete Einschränkungen. Schließe unabhängig prüfbare Arbeit ab und benenne den noch offenen Nachweis.

## Übergabe und Dokumentationspflege

Status einer Implementierungsaufgabe wird ausschließlich in `docs/TASKS.md` gepflegt. Markiere sie erst als erledigt, wenn ihre Abnahmekriterien erfüllt sind. Halte bei Teilfortschritt konkret fest, welche Prüfung fehlt.

Aktualisiere die kleinste betroffene Dokumentationsmenge: Befehle im README, Entscheidungen in `docs/DECISIONS.md`, fachliche/architektonische Änderungen im Projektplan. Empfehlungen werden durch Wiederholung nicht zu bestätigten Entscheidungen.

Berichte zum Abschluss knapp: Ergebnis, relevante Dateien, tatsächlich ausgeführte Prüfungen sowie verbleibende Einschränkungen. Unterscheide lokale Tests, Synthese, AWS-Live-Nachweise und mobile Tests. Behaupte keinen erfolgreichen Test oder Deployment ohne Ergebnis.

## Code Review Rules

Prüfe besonders auf ungeschützte Benutzerrouten, ungeprüfte Claims, fremde Kaufzuordnung, Entitlement-Freigabe allein durch Checkout-Redirect, vorzeitig abgeschlossene Events, verlorene Updates bei konkurrierenden Providern und das Absturzfenster zwischen Speicherung und Eventversand. Formatiertests gehören in automatisierte Checks.
