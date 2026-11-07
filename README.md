# Formora

Fitness-App für Krafttraining, Laufen, Ernährung und Gewicht – eine HTML-Datei, Vanilla JS.

**Online-Version:** Konten mit E-Mail + Passwort, Daten in Supabase (jeder sieht nur seine eigenen), optional Face ID / Touch ID als Sperre. Wird bei jedem Push auf `main` per GitHub Actions auf GitHub Pages veröffentlicht.

- Einrichtung: [`docs/ONLINE-VERSION.md`](docs/ONLINE-VERSION.md)
- Datenbank: [`supabase/schema.sql`](supabase/schema.sql)
- Build: `python3 tools/build_cloud.py index.html _site/index.html`
- Test: `npm install && npm run test:cloud`
