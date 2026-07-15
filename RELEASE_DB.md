# Procedura migrazione database produzione LWManager

Questa release trasforma il database esistente alla struttura multi-alleanza con `allianceId` senza copiare QA su produzione e senza cancellare dati storici.

## Valori default produzione

I valori sotto sono usati dalle migrazioni con fallback automatico se le variabili ambiente non sono presenti:

```bash
DEFAULT_ALLIANCE_CODE=BISS
DEFAULT_SERVER_NUMBER=833
DEFAULT_ALLIANCE_ID=1
DEFAULT_STANDARD_PIN=111111
DEFAULT_SUPERVISOR_PIN=151515
DEFAULT_MASTER_PIN=550130
```

I PIN sono usati solo per generare hash bcrypt negli account iniziali: non vengono salvati in chiaro e non vengono stampati nei log runtime.

## Regole fondamentali

1. Non copiare mai il database QA su produzione.
2. Non eseguire drop di database o collection.
3. Fare sempre un backup produzione prima della migrazione.
4. Se possibile, testare prima su una copia recente del database produzione.
5. In produzione reale usare `--confirm-production` oppure `MIGRATION_CONFIRM_PRODUCTION=true`.

## Backup produzione

Esempio con `mongodump`:

```bash
mkdir -p backups
mongodump --uri="$MONGO_URI" --out="backups/lwmanager-prod-$(date +%Y%m%d-%H%M%S)"
```

Conservare il backup in un luogo sicuro prima di procedere.

## Test su copia del database produzione

1. Ripristinare il dump su un database temporaneo/staging.
2. Impostare `MONGO_URI` verso la copia, non verso produzione.
3. Eseguire dry-run, migrazione reale e check.
4. Verificare login e schermate principali.

## Esecuzione consigliata

### 1. Dry-run

Il dry-run calcola cosa verrebbe creato/aggiornato, ma non scrive nulla: non crea collection, non crea indici, non aggiorna `schema_migrations` e non modifica account o dati applicativi.

```bash
npm run migrate -- --dry-run
# oppure
npm run migrate:dry-run
```

### 2. Migrazione reale

Ambienti non production:

```bash
npm run migrate
```

Produzione con `NODE_ENV=production`:

```bash
npm run migrate -- --confirm-production
```

In alternativa:

```bash
MIGRATION_CONFIRM_PRODUCTION=true npm run migrate
```

### 3. Check finale

```bash
npm run migrate:check
```

Il check non modifica il database e termina con exit code `1` se trova errori.

### 4. Reset esplicito PIN default

Normalmente gli account esistenti mantengono l'hash PIN già presente. Per forzare la rigenerazione degli hash dai PIN default:

```bash
npm run migrate -- --reset-default-pins
```

In produzione aggiungere anche `--confirm-production` se `NODE_ENV=production`.

## Migrazioni incluse

- `001_create_schema_migrations`: crea la collection di controllo `schema_migrations`.
- `002_create_alliances_default`: crea/aggiorna l'alleanza `BISS#833` con `allianceId=1` e relativi indici univoci.
- `003_add_alliance_id_to_existing_data`: aggiunge `allianceId=1` ai dati applicativi esistenti senza rimuovere i vecchi campi tenant.
- `004_create_default_accounts`: ripara account legacy senza username e crea/aggiorna account `master`, `BISS#833:admin`, `BISS#833:supervisor` usando hash bcrypt.
- `005_create_indexes`: crea gli indici principali.
- `099_cleanup_legacy_tenant_fields.js.disabled`: migrazione opzionale disabilitata per rimuovere in futuro `allianceCode`, `serverNumber`, `allianceKey`. Non viene eseguita automaticamente in questa release.

## Verifiche manuali dopo il check

1. Login master: `master / 550130`.
2. Login alleanza admin/standard: `BISS / 833 / 111111`.
3. Login supervisore: `BISS / 833 / 151515`.
4. Verificare la sezione Potenze.
5. Verificare il Registro Eventi.
6. Verificare i Grafici.
7. Verificare Gestione Alleanze.

## Rollback

Opzione primaria: ripristinare il backup produzione creato prima della migrazione.

```bash
mongorestore --uri="$MONGO_URI" --drop backups/<cartella-backup>
```

Usare `--drop` solo durante rollback pianificato e dopo aver verificato di puntare al database corretto.

Se il problema è applicativo e i dati migrati sono validi, valutare anche il deploy della versione precedente dell'applicazione.

## Note di sicurezza

- I log non stampano `MONGO_URI` completo, PIN, password, `pinHash` o `passwordHash`.
- La collection `schema_migrations` registra nome migrazione, data esecuzione, stato, summary, errore e durata.
- Le migrazioni sono idempotenti: una riesecuzione non duplica account né alleanze e non cancella dati.
- I campi legacy tenant non vengono rimossi nella prima fase per facilitare rollback e diagnosi.
