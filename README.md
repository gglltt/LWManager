# LWManager - Step 1 (Auth)

## Features

- Register with email + nickname + password
- First registered user gets authLevel=5, others authLevel=1
- Email verification via link
- Password reset via email link
- Login via JWT stored in httpOnly cookie
- Simple EJS UI

## Setup

1) Install deps

```bash
npm install
```

## Supervisor / Performance VS

Set `SUPERVISOR_PIN` (or legacy-compatible `APP_PIN_SUPERVISOR`) to a dedicated 6-digit PIN to enable the supervisor role. Supervisors receive access level 3 and can use Performance VS; admins (level 5) can use it too. Standard users cannot access the Performance VS routes.
