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

Tenant setup creates only the required PIN accounts: `master` (PIN `550130`), `supervisor` (PIN `151515`), and `standard` (PIN `111111`). Supervisors receive access level 3 and can use Performance VS; standard users cannot access the Performance VS routes. Global administration remains reserved to `master`.
