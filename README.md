\# LWManager - Step 1 (Auth)



\## Features

\- Register with email + nickname + password

\- First registered user gets authLevel=5, others authLevel=1

\- Email verification via link

\- Password reset via email link

\- Login via JWT stored in httpOnly cookie

\- Simple EJS UI



\## Setup

1\) Install deps

```bash

npm install


## LastWar Tools API (admin)

Per recuperare i player dell'alleanza **Biss** dal backend:

- configura la variabile `LASTWAR_API_KEY` (Bearer token creato su api.lastwar.tools)
- opzionale: `LASTWAR_API_BASE_URL` (default `https://api.lastwar.tools`, con fallback automatico su `https://api.lastwar.dev`)
- endpoint admin-only: `GET /lastwar/biss-players`

L'endpoint richiede login con ruolo admin (`authLevel >= 5`) e restituisce JSON con lista giocatori.
