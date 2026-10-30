# BluePLM Schema Modules (5.0 baseline)

Since 5.0 the modules are not optional: `core.sql` and every file here form one baseline,
applied to an empty database in file-name order (see `../README.md`). They stay separate
files so each area of the schema reads on its own.

| File | Contents |
|------|----------|
| `10-source-files.sql` | Vaults and vault access, files and versions, references, folders, file workflows and gate reviews, backups, metadata columns, item designations, share links, comments, the `vault` storage bucket |
| `15-inspection.sql` | Inspection characteristics (native ballooning) and inspection methods; `file_checkin()` reads them |
| `20-change-control.sql` | ECOs, drawing reviews (packages, rounds, responses, decisions), deviations, process templates, ECO checklists and gate approvals |
| `30-supply-chain.sql` | Organization addresses, suppliers and contacts, part pricing, RFQs |
| `40-integrations.sql` | Organization integrations (Odoo), saved Odoo configurations, the service-only credential store, sync logs, webhooks, Google Drive settings, SOLIDWORKS licences |
| `50-extensions.sql` | Native extensions installed per organization and the `org-extensions` storage bucket |

A later file may add columns, constraints and indexes to a table of an earlier one (under
"ADDITIONS TO TABLES OF EARLIER FILES"), and may define functions that earlier files'
policies do not need. Nothing here is re-run: a change is a new numbered migration in
`../migrations/`.

The Customers module left core in 4.8.0; it is the private native extension
`blueplm.customers`, which ships its own SQL.
