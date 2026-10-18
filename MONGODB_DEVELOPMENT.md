# MongoDB Atlas — Development and Deployment Setup

Updated: 18 October 2026  
Related: [Database Design](./DATABASE_DESIGN.md), [System Architecture](./SYSTEM_ARCHITECTURE.md)

## Cluster details

| Setting                 | Value                                                       |
| ----------------------- | ----------------------------------------------------------- |
| Provider                | MongoDB Atlas                                               |
| Cluster name            | `marrige-suite` (Atlas spelling)                            |
| SRV hostname            | `marrige-suite.2ytx40z.mongodb.net`                         |
| Database username       | `saurabhsunny`                                              |
| Authentication database | `admin`                                                     |
| Connection scheme       | `mongodb+srv`                                               |
| Development database    | Proposed: `marriage_suite_dev`; not yet created or verified |

MongoDB Compass connected successfully on 18 October 2026 with the updated database-user password and explicit `authSource=admin`. The visible databases were `admin`, `config`, `local`, and `sample_mflix`. This verifies Compass connectivity only; application connectivity, user roles, validators, indexes, backups, region and cluster tier have not been verified.

## Connection templates

Compass connection URI (replace the password placeholder locally):

```text
mongodb+srv://saurabhsunny:<DB_PASSWORD>@marrige-suite.2ytx40z.mongodb.net/?authSource=admin
```

Backend development environment configuration (the scaffold reads these variables):

```dotenv
MONGODB_URI=mongodb+srv://saurabhsunny:<DB_PASSWORD>@marrige-suite.2ytx40z.mongodb.net/?authSource=admin
MONGODB_DB_NAME=marriage_suite_dev
```

The backend reads `MONGODB_URI` and selects `MONGODB_DB_NAME`, then pings Atlas before listening. Development loads `server/.env`; production uses deployment environment/secret configuration and does not load that file. Obtain the current password from the project owner through a secure channel and replace the placeholder locally. Percent-encode reserved characters if a password is embedded in a URI.

Keep actual values in a git-ignored local environment file or deployment secret configuration. Commit only placeholder examples. Never put the URI/password in frontend code, browser-exposed environment variables (including `VITE_*`), screenshots or logs. The password is intentionally excluded from documentation.

## Development workflow

1. Connect to the cluster in Compass using the template and current database-user credentials. Use **Connect** for a session; save credentials only when explicitly intended.
2. Adopt and create the development database separately from the existing system and sample databases. Do not use `admin`, `config`, `local`, or `sample_mflix` for wedding application data.
3. Connect the backend using private environment configuration; verify connectivity with a server-side ping before relying on application features.
4. Implement versioned migrations for the collections, validators and indexes defined in [Database Design](./DATABASE_DESIGN.md). Record applied versions in `schemaMigrations`.
5. Seed synthetic development data, including two weddings for tenant-isolation checks. Verify the application's reads and writes against the selected development database.

The connection session did not create application databases, collections, validators, indexes, migrations or seed data. Production must use separate configuration, credentials and database as required by the architecture.

## Deployment configuration

The cluster above is the current verified Compass target. It replaces the previous `marrige-suite.5eyh5qq.mongodb.net` / `sunnygrt259_db_user` connection. This documentation update does not install credentials, change Atlas settings or deploy the application.

For production, provision a separate application database and database user as required by the architecture. The following values are placeholders until production resources are selected:

```dotenv
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://<YOUR_APP_HOST>
LOG_LEVEL=info
TRUST_PROXY=false
MONGODB_URI=mongodb+srv://<PRODUCTION_DB_USER>:<URL_ENCODED_PASSWORD>@<PRODUCTION_ATLAS_HOST>/?authSource=admin
MONGODB_DB_NAME=marriage_suite_prod
```

`marriage_suite_prod` is a proposed name, not a provisioned database. Inject the actual URI/password through the hosting provider's private environment/secret settings. Replace every placeholder before starting; `APP_ORIGIN` must be an HTTPS origin without a path or trailing slash. Keep `TRUST_PROXY=false` until proxy trust is configured for the chosen hosting topology.

Before serving application traffic:

1. Verify the deployment host's Atlas network access and the application's database-user permissions for its selected database. Keep TLS and certificate validation enabled.
2. Build with development dependencies available using `npm run build`, then start with `npm start`. Deploy `shared/dist`, `server/dist`, `client/dist`, workspace manifests, the root lockfile and production dependencies together, preserving the shared workspace link.
3. Verify `/api/v1/health/live` and `/api/v1/health/ready` on the deployed HTTPS origin. Readiness pings the database; it does not verify write permissions, schema deployment or tenant isolation.
4. Apply and verify the versioned migrations/indexes/validators when implemented. Startup does not create them. Verify backups/restoration and the two-wedding isolation checks before the pilot.

Production hosting, credentials, database, migrations and backup configuration remain pending. Only the Compass connection to the current cluster has been verified in this chat.

## Troubleshooting

- **`bad auth : authentication failed`:** The earlier password was rejected; the updated password succeeded. Check the exact database username, current password, `authSource=admin`, and URI encoding. Use database-user credentials rather than the Atlas website login.
- **Timeout or network failure:** Check cluster availability and the client's Atlas network access entry. The earlier Compass diagnostic reported the cluster ready and client IP allowed; those checks are historical and can change.
- **Application database missing:** The proposed development database is not part of the verified Compass result. Create it through the development setup/migration flow and select its name explicitly in the backend.
- **Permission error after connecting:** Check the database user's assigned roles for the intended development database. Successful authentication alone does not establish application read/write permissions.
