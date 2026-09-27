# AUREUS-X

AUREUS-X is a deployable geohistorical research application for locating and explaining documentary treasure candidates on a real map.

## What is implemented

- Free-form subject + city/territory search.
- Period selector from antiquity through 1960.
- Google Maps JavaScript API as the primary map engine.
- Automatic OpenStreetMap fallback when no Google Maps key is configured.
- Live deep-archive queries against Gallica/BnF, BnF Catalogue général, Internet Archive, and Wikisource.
- Geocoding and candidate clustering.
- Evidence scoring with explicit provenance.
- Candidate cards with treasure description and a dedicated “Pourquoi ici ?” explanation.
- Distinction between strongly corroborated, corroborated, documentary trace, and legend/tradition.
- Source links for manual scholarly verification.

## Environment

Set `GOOGLE_MAPS_API_KEY` on the hosting platform. Optionally set `GOOGLE_MAP_ID`.

Google Maps Platform should have Maps JavaScript API enabled. Restrict the browser key to the production domain.

## Deploy

The repository is structured for Vercel with static frontend files and `/api/*.js` serverless functions.
