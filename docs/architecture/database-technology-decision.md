# WASLA V2 — Database Technology Decision

## 1. Purpose

Record the initial database technology direction
for WASLA V2.

## 2. Database Engine

Decision: PostgreSQL.

Reasons:
- Relational data integrity.
- Foreign key constraints.
- Transaction support.
- Indexing and query capabilities.
- Row-level security support.
- Mature ecosystem.
- Suitable for multi-account business relationships.

## 3. Database Access Layer

Recommended direction: Drizzle ORM.

The current API already includes the PostgreSQL
node-postgres driver (`pg`).

Drizzle supports PostgreSQL through node-postgres
and provides TypeScript schema definitions.

The database access layer must:
- Keep database access inside the backend.
- Use typed queries where practical.
- Support transactions.
- Avoid exposing database credentials.
- Keep business rules outside database UI code.

## 4. Migration Management

Recommended tool: Drizzle Kit.

Migration requirements:
- Generate version-controlled SQL migration files.
- Review migrations before applying them.
- Keep migration history in Git.
- Never apply unreviewed production migrations.
- Test migrations against a separate test database.
- Back up production before risky changes.
- Avoid destructive changes without a recovery plan.

## 5. Hosting Provider

Status: Not selected.

Provider evaluation must consider:
- Available hosting regions.
- Data residency requirements.
- Total operating cost.
- Automated backups.
- Point-in-time recovery.
- Connection pooling.
- Monitoring and alerts.
- High availability.
- Read replicas.
- Export and migration portability.

The database engine must remain standard PostgreSQL
to reduce provider lock-in.

## 6. Environments

The platform must separate:

- Local development
- Automated testing
- Staging
- Production

Each environment must use independent credentials
and database resources.

Demo data must never be mixed with production data.

## 7. Connection Security

- Database credentials remain server-side.
- TLS must be enabled for remote production connections.
- Connection pooling must be configured appropriately.
- Database access must use least-privilege credentials.
- Credentials must never be committed to Git.

## 8. Backup and Recovery

Before production launch:

- Configure automated backups.
- Define retention periods.
- Define recovery objectives.
- Test database restoration.
- Document incident recovery procedures.

A backup is not considered reliable
until restoration has been tested.

## 9. Scaling Strategy

Initial deployment may use one managed PostgreSQL
instance.

Future scaling may include:
- Larger database compute resources.
- Connection pooling.
- Query optimization.
- Read replicas.
- Caching.
- Partitioning where justified.

Scaling decisions must be based on measurements,
not assumptions.

## 10. Implementation Sequence

1. Confirm the logical data model.
2. Add Drizzle dependencies and configuration.
3. Define the initial identity schema.
4. Generate and review SQL migrations.
5. Provision a separate development database.
6. Apply migrations and test integrity.
7. Configure staging and production later.

## 11. Deferred Decisions

- Hosting provider.
- Hosting region.
- Production database size.
- Backup retention period.
- High availability configuration.
- Production deployment topology.

## 12. Status

PostgreSQL: Selected as database engine.

Drizzle ORM and Drizzle Kit: Recommended
implementation tools.

Hosting provider: Deferred.

No database has been provisioned.
No migration has been applied.
