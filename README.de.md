# mite-mcp-server

[![CI](https://github.com/Stefan39/mite-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Stefan39/mite-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) · **Deutsch**

Fragen Sie Claude nach Ihrer [mite](https://mite.de)-Zeiterfassung — „Wie viele Stunden haben wir dieses Jahr je Projekt und Monat gearbeitet, und was hat das eingebracht?“ — und erhalten Sie die Antwort aus einer Auswertung, die mite selbst rechnet, statt aus hunderten Einträgen, die das Modell addieren muss.

> Inoffiziell. Nicht mit der mite GmbH verbunden oder von ihr unterstützt.

## Warum dieser Server

- **Fertige Auswertungen.** mite gruppiert serverseitig (`group_by`), ein ganzes Jahr ist eine Anfrage und eine kleine Antwort.
- **Standardmäßig sicher.** Startet nur lesend. Schreibende Werkzeuge gibt es erst, wenn Sie den Modus umstellen; eine Allowlist schränkt weiter ein. Werkzeuge außerhalb von Modus und Allowlist sieht der Agent gar nicht.
- **Ihr Schlüssel bleibt Ihrer.** API-Key nur aus der Umgebung, als Header gesendet, aus jeder Fehlermeldung entfernt, nie geloggt.

## Werkzeuge

| Werkzeug                                                             | Modus     | Funktion                                                                                                                                            |
| -------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mite_whoami`                                                        | read-only | Account, eigener Benutzer und Rolle, Servermodus und freigegebene Werkzeuge                                                                         |
| `mite_report_projects_by_month`                                      | read-only | Stunden und Umsatz je Projekt und Monat für einen Zeitraum; Filter nach Kunde, Projekt, Leistung, Benutzer, abrechenbar                             |
| `mite_report`                                                        | read-only | Stunden, Umsatz und Anteil je 1–3 Gruppierungen (Kunde, Projekt, Leistung, Benutzer, Tag, Woche, Monat, Jahr); gleiche Filter                       |
| `mite_report_budget`                                                 | read-only | Budget, Verbrauch, Rest und Prozent verbraucht je Projekt über die gesamte Laufzeit; Minuten in Stunden, Cent in Währungseinheiten                  |
| `mite_report_billable_ratio`                                         | read-only | Abrechenbare und nicht abrechenbare Stunden und abrechenbarer Anteil in Prozent für einen Zeitraum, optional je Kunde, Projekt, Benutzer oder Monat |
| `mite_list_time_entries`                                             | read-only | Einzelne Zeiteinträge für einen Zeitraum; Filter, `limit`/`page`, `has_more`                                                                        |
| `mite_get_time_entry`                                                | read-only | Ein Zeiteintrag nach ID                                                                                                                             |
| `mite_tracker_status`                                                | read-only | Läuft der Tracker, und auf welchem Eintrag                                                                                                          |
| `mite_list_customers`                                                | read-only | Kunden, aktiv oder archiviert (`archived: true`)                                                                                                    |
| `mite_list_projects`                                                 | read-only | Projekte mit Kunde und Budget, aktiv oder archiviert                                                                                                |
| `mite_list_services`                                                 | read-only | Leistungen, aktiv oder archiviert                                                                                                                   |
| `mite_list_users`                                                    | read-only | Benutzer und Rollen (ohne E-Mail, ohne Stundensätze), aktiv oder archiviert                                                                         |
| `mite_create_time_entry`                                             | write     | Legt einen Zeiteintrag an; `dry_run: true` zeigt nur eine Vorschau und schreibt nichts                                                              |
| `mite_update_time_entry`                                             | write     | Ändert Felder eines Zeiteintrags (gesperrte: siehe unten); `dry_run: true` zeigt aktuelle und neue Werte und schreibt nichts                        |
| `mite_start_tracker`                                                 | write     | Startet den Tracker auf einem Zeiteintrag                                                                                                           |
| `mite_stop_tracker`                                                  | write     | Stoppt den Tracker auf einem Zeiteintrag                                                                                                            |
| `mite_delete_time_entry`                                             | write     | Löscht einen Zeiteintrag in zwei Schritten mit Bestätigungs-Token (siehe unten); gesperrte Einträge: siehe „Gesperrte Einträge“                     |
| `mite_create_customer`, `mite_create_project`, `mite_create_service` | admin     | Legt einen Kunden, ein Projekt oder eine Leistung an; `dry_run: true` zeigt nur eine Vorschau und schreibt nichts                                   |
| `mite_update_customer`, `mite_update_project`, `mite_update_service` | admin     | Ändert Felder; `archived: true` archiviert, `archived: false` stellt wieder her; `dry_run: true` schreibt nichts                                    |
| `mite_delete_customer`, `mite_delete_project`, `mite_delete_service` | admin     | Löscht in zwei Schritten mit Bestätigungs-Token (siehe unten); lehnt mite ab, etwa weil noch Zeiteinträge daran hängen, kommt das als Fehler zurück |

### Löschen mit Bestätigungs-Token

`mite_delete_time_entry` und die drei Lösch-Werkzeuge für Stammdaten löschen nie beim ersten Aufruf:

1. Mit der `id` aufrufen (oder mit `dry_run: true`). Die Antwort enthält eine Vorschau und ein `confirm_token`; gelöscht wird nichts.
2. Erneut mit derselben `id` und dem `confirm_token` aufrufen. Erst dann wird gelöscht.

Das Token gilt nur für dieses Werkzeug mit genau diesen Argumenten, 5 Minuten lang und nur einmal. Es ist nur dem laufenden Serverprozess bekannt; ein Neustart macht es ungültig.

Unterstützt der MCP-Client Elicitation, fragt der zweite Aufruf (und jeder Aufruf mit `force: true` und Token) zusätzlich beim Menschen nach, mit einer kurzen Zusammenfassung dessen, was gelöscht oder erzwungen wird. Nur bei Zustimmung wird etwas ausgeführt. Bei Ablehnen oder Abbrechen geht nichts an mite, und das Token bleibt bis zum Ablauf unbenutzt. Clients ohne Elicitation werden nicht gefragt; dann gilt allein das Token.

> **Unterstützung in Clients (geprüft am 28.10.2026):** Claude Desktop bietet Elicitation noch nicht an und zeigt deshalb keinen Dialog; Löschen läuft dort nur über das Token. Sobald ein Client Elicitation anmeldet, greift die zusätzliche Nachfrage ohne neues Release dieses Servers.

### Gesperrte Einträge

Gesperrte Zeiteinträge lassen sich standardmäßig weder ändern noch löschen; mite antwortet mit 423, und das Werkzeug meldet einen „locked“-Fehler. `force` wird nie automatisch gesetzt, auch nicht nach einem 423.

Nur im Modus `admin` akzeptieren `mite_update_time_entry` und `mite_delete_time_entry` zusätzlich `force: true`. Ein Aufruf mit `force: true` braucht immer ein `confirm_token`, auch beim Ändern: Der erste Aufruf (oder `dry_run: true`) liefert eine Vorschau mit dem Hinweis, dass der Eintrag gesperrt ist, und ein Token; erst ein zweiter Aufruf mit denselben Argumenten, `force: true` und dem Token führt aus. In den Modi `read-only` und `write` gibt es den Parameter nicht.

Weitere Werkzeuge (weitere Auswertungen) sind geplant — siehe [Architekturentscheidung](docs/adr/0001-architecture.md).

## Installation ohne Technik (Claude Desktop)

1. [`mite-mcp-server.mcpb`](https://github.com/Stefan39/mite-mcp-server/releases/latest/download/mite-mcp-server.mcpb) aus dem neuesten Release herunterladen.
2. Die Datei doppelklicken. Claude Desktop öffnet sich und bietet die Installation der Erweiterung an.
3. Die Einstellungen ausfüllen und die Erweiterung aktivieren:

![Einstellungen der mite-Erweiterung in Claude Desktop](docs/images/claude-desktop-settings.png)

| Einstellung                     | Bedeutung                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| mite-Account                    | Der Name in Ihrer mite-Adresse: bei `https://beispiel.mite.de` geben Sie `beispiel` ein                     |
| API-Key                         | Ihr persönlicher mite-API-Key; Claude Desktop speichert ihn sicher und zeigt ihn maskiert an                |
| Zeiteinträge schreiben erlauben | Aus (Standard): nur lesen. An: Zeiteinträge anlegen, ändern und löschen, Tracker starten und stoppen        |
| Stammdaten verwalten            | Aus (Standard). An: Kunden, Projekte und Leistungen verwalten; schließt das Schreiben von Zeiteinträgen ein |
| Erlaubte Werkzeuge              | Optional, kommagetrennte Werkzeugnamen; leer heißt: alle Werkzeuge, die die Schalter erlauben               |

Kein JSON, keine Umgebungsvariablen, keine Node.js-Installation: Claude Desktop startet das Bundle mit seinem eingebauten Node.js. Sie brauchen einen mite-Account mit freigeschaltetem API-Zugriff (in den Benutzereinstellungen von mite aktivieren) und Ihren API-Key von dort.

Einstellungen später ändern: Claude Desktop → Einstellungen → Erweiterungen → mite. Dort lassen sich zusätzlich einzelne Werkzeuge ein- und ausschalten — ergänzend zu den Schaltern oben, die festlegen, welche Werkzeuge es überhaupt gibt.

## Manuelle Einrichtung (Claude Desktop, für Entwickler)

Voraussetzungen: Node.js 22 oder neuer, ein mite-Account mit freigeschaltetem API-Zugriff (in den Benutzereinstellungen von mite aktivieren) und Ihr API-Key von dort.

> Das Paket ist noch nicht auf npm veröffentlicht. Bis dahin aus dem Quellcode bauen:
>
> ```bash
> git clone https://github.com/Stefan39/mite-mcp-server.git
> cd mite-mcp-server && npm ci && npm run build
> ```

Server in `claude_desktop_config.json` eintragen (macOS: `~/Library/Application Support/Claude/`) und Claude Desktop neu starten:

```json
{
  "mcpServers": {
    "mite": {
      "command": "node",
      "args": ["/absoluter/pfad/zu/mite-mcp-server/dist/index.js"],
      "env": {
        "MITE_ACCOUNT": "ihr-account",
        "MITE_API_KEY": "ihr-api-key"
      }
    }
  }
}
```

Dann zum Beispiel fragen: _„Zeig mir Stunden und Umsatz je Projekt und Monat für dieses Jahr.“_

## Konfiguration

| Variable           | Pflicht | Bedeutung                                                                        |
| ------------------ | ------- | -------------------------------------------------------------------------------- |
| `MITE_ACCOUNT`     | ja      | Account-Name — die Subdomain von `https://<account>.mite.de`                     |
| `MITE_API_KEY`     | ja      | Ihr persönlicher mite-API-Key                                                    |
| `MITE_MODE`        | nein    | `read-only` (Standard), `write` oder `admin`                                     |
| `MITE_ALLOW_WRITE` | nein    | `true` = Modus `write`; setzt der Schalter im Bundle, Alternative zu `MITE_MODE` |
| `MITE_ALLOW_ADMIN` | nein    | `true` = Modus `admin`; setzt der Schalter im Bundle, Alternative zu `MITE_MODE` |
| `MITE_TOOLS`       | nein    | Kommagetrennte Allowlist, z. B. `mite_report_projects_by_month`                  |

Entweder `MITE_MODE` oder die beiden Schalter; `MITE_MODE` zusammen mit einem Schalter auf `true` lehnt der Server ab. Werte `true`/`false` (auch `1`/`0`, `yes`/`no`, `on`/`off`).

mite prüft jeden Aufruf weiterhin gegen die Rolle Ihres Keys. Der Server kann das nur einschränken, nie erweitern.

## Entwicklung

```bash
npm ci
npm run check   # Lint, Format, Typecheck, Tests mit Coverage, Build
```

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) und die [Architekturentscheidung](docs/adr/0001-architecture.md).

## Lizenz

[MIT](LICENSE) © Stefan Jacomeit — [www.jacomeit.de](https://www.jacomeit.de)
