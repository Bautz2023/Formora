# Formora online: Konten, Cloud-Speicher, Face ID

Die Online-Version läuft auf GitHub Pages und speichert in Supabase. Jeder legt sich ein eigenes Konto an (E-Mail + Passwort) und sieht nur seine eigenen Daten. Auf dem Handy kann man zusätzlich Face ID / Touch ID als Sperre einschalten.

| Teil | Wo |
|---|---|
| App-Code | `index.html` (gleiche Datei wie die Claude-Version) |
| Umbau zur Online-Version | `tools/build_cloud.py` |
| Supabase-Zugang (öffentlich) | `tools/cloud_config.json` |
| Datenbank-Einrichtung | `supabase/schema.sql` |
| Veröffentlichung | `.github/workflows/pages.yml` (bei jedem Push auf `main`) |
| Test | `npm run test:cloud` |

## 1. Supabase-Projekt anlegen (ca. 5 Minuten)

1. Auf **supabase.com** kostenlos registrieren, zum Beispiel mit GitHub.
2. **New project**:
   - Name: `formora`
   - Region: **Central EU (Frankfurt)**
   - Ein Datenbank-Passwort vergeben und gut aufheben. Formora braucht es nicht.
3. Warten, bis das Projekt bereit ist (ca. 1–2 Minuten).
4. Links auf **SQL Editor** → **New query**. Den kompletten Inhalt von `supabase/schema.sql` einfügen und auf **Run** tippen. Ergebnis: „Success. No rows returned“.
5. Links auf **Project Settings → API** (oder „Data API“ / „API Keys“). Zwei Werte notieren:
   - **Project URL**, z. B. `https://abcdefgh.supabase.co`
   - **anon public** Key (beginnt mit `eyJ…`), oder bei neuen Projekten der **Publishable key** (`sb_publishable_…`)

   ⚠️ **Niemals** den `service_role`- bzw. `secret`-Schlüssel weitergeben. Der hat Vollzugriff auf alle Daten.

## 2. GitHub-Repository

1. Auf github.com ein neues, leeres Repository anlegen, z. B. `formora`. Ohne README, öffentlich (GitHub Pages ist für private Repos nur mit Bezahl-Abo möglich).
2. Das Repository mit der Claude-Sitzung verbinden, damit Claude den Code hochladen kann.
3. Nach dem ersten Hochladen im Repository: **Settings → Pages → Source: GitHub Actions**.
4. Die Adresse lautet dann `https://<dein-github-name>.github.io/formora/`.

## 3. Supabase mit der Adresse verbinden

In Supabase unter **Authentication → URL Configuration**:

- **Site URL**: `https://<dein-github-name>.github.io/formora/`
- **Redirect URLs**: dieselbe Adresse hinzufügen

Sonst führen die Links in Bestätigungs- und „Passwort vergessen“-Mails ins Leere.

Optional unter **Authentication → Emails**: die Texte der Mails auf Deutsch ändern. Der kostenlose Mailversand von Supabase ist auf wenige Mails pro Stunde begrenzt. Für viele neue Nutzer später einen eigenen SMTP-Dienst eintragen.

## 4. Deine Daten umziehen

1. In der **bisherigen** Formora (Claude-Link): Einstellungen → **Export als JSON**.
2. In der **neuen** Formora anmelden: Einstellungen → **Import …** → die Datei wählen.

Fotos (Formupdate, Geräte-Fotos) liegen in der Claude-Version und kommen nicht mit. Neue Fotos werden im eigenen Konto gespeichert.

## Was anders ist als in der Claude-Version

- **Foto-Schätzung beim Essen und Coach-Check** brauchen Claude und sind online nicht verfügbar. Später wäre das über eine Supabase Edge Function mit eigenem Claude-API-Schlüssel nachrüstbar.
- **Streckenplaner** ist ausgeblendet, er startet an deiner Adresse.
- **Face ID** ist eine Gerätesperre: Formora fragt beim Öffnen und nach mehr als 5 Minuten im Hintergrund nach Face ID / Touch ID oder dem Gerätecode. Den eigentlichen Schutz der Daten übernehmen das Konto und die Regeln in der Datenbank (Row Level Security). Face ID wird pro Gerät eingeschaltet: Einstellungen → Konto.
- **Als Projektinhaber** kannst du im Supabase-Dashboard technisch alle Daten sehen, auch die deiner Freunde. Andere Nutzer sehen nur ihre eigenen.

## Sicherheit kurz erklärt

- Die Tabelle `docs` hat Row Level Security. Jede Abfrage sieht nur Zeilen mit `user_id = auth.uid()`. Nicht angemeldete Zugriffe (`anon`) haben keine Rechte.
- Fotos liegen im privaten Bucket `fotos` im Ordner `<user-id>/`. Sie sind nur über zeitlich begrenzte, signierte Links abrufbar.
- Der öffentliche `anon`-Schlüssel darf im Code stehen, er ist dafür gedacht. Geschützt wird über die Regeln oben.
