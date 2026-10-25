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

| Werkzeug                        | Modus     | Funktion                                                                                                                                            |
| ------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mite_whoami`                   | read-only | Account, eigener Benutzer und Rolle, Servermodus und freigegebene Werkzeuge                                                                         |
| `mite_report_projects_by_month` | read-only | Stunden und Umsatz je Projekt und Monat für einen Zeitraum; Filter nach Kunde, Projekt, Leistung, Benutzer, abrechenbar                             |
| `mite_report`                   | read-only | Stunden, Umsatz und Anteil je 1–3 Gruppierungen (Kunde, Projekt, Leistung, Benutzer, Tag, Woche, Monat, Jahr); gleiche Filter                       |
| `mite_report_budget`            | read-only | Budget, Verbrauch, Rest und Prozent verbraucht je Projekt über die gesamte Laufzeit; Minuten in Stunden, Cent in Währungseinheiten                  |
| `mite_report_billable_ratio`    | read-only | Abrechenbare und nicht abrechenbare Stunden und abrechenbarer Anteil in Prozent für einen Zeitraum, optional je Kunde, Projekt, Benutzer oder Monat |
| `mite_list_time_entries`        | read-only | Einzelne Zeiteinträge für einen Zeitraum; Filter, `limit`/`page`, `has_more`                                                                        |
| `mite_get_time_entry`           | read-only | Ein Zeiteintrag nach ID                                                                                                                             |
| `mite_tracker_status`           | read-only | Läuft der Tracker, und auf welchem Eintrag                                                                                                          |
| `mite_list_customers`           | read-only | Kunden, aktiv oder archiviert (`archived: true`)                                                                                                    |
| `mite_list_projects`            | read-only | Projekte mit Kunde und Budget, aktiv oder archiviert                                                                                                |
| `mite_list_services`            | read-only | Leistungen, aktiv oder archiviert                                                                                                                   |
| `mite_list_users`               | read-only | Benutzer und Rollen (ohne E-Mail, ohne Stundensätze), aktiv oder archiviert                                                                         |

Weitere Werkzeuge (Zeiteinträge, Stammdaten, weitere Auswertungen, Schreiben mit Bestätigung) sind geplant — siehe [Architekturentscheidung](docs/adr/0001-architecture.md).

## Schnellstart (Claude Desktop)

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

| Variable       | Pflicht | Bedeutung                                                       |
| -------------- | ------- | --------------------------------------------------------------- |
| `MITE_ACCOUNT` | ja      | Account-Name — die Subdomain von `https://<account>.mite.de`    |
| `MITE_API_KEY` | ja      | Ihr persönlicher mite-API-Key                                   |
| `MITE_MODE`    | nein    | `read-only` (Standard), `write` oder `admin`                    |
| `MITE_TOOLS`   | nein    | Kommagetrennte Allowlist, z. B. `mite_report_projects_by_month` |

mite prüft jeden Aufruf weiterhin gegen die Rolle Ihres Keys. Der Server kann das nur einschränken, nie erweitern.

## Entwicklung

```bash
npm ci
npm run check   # Lint, Format, Typecheck, Tests mit Coverage, Build
```

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) und die [Architekturentscheidung](docs/adr/0001-architecture.md).

## Lizenz

[MIT](LICENSE) © Stefan Jacomeit — [www.jacomeit.de](https://www.jacomeit.de)
