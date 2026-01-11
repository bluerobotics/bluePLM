---
title: "Migrate to Journal-Based Sync (Event Sourcing)"
labels: enhancement, architecture
---

## Problem

Current sync uses timestamp comparison (`localModTime` vs `updated_at`) to detect changes. This has issues:
- Clock skew between machines causes incorrect conflict detection
- Requires polling (no push notifications)
- Hard to sync reliably after offline periods

## Solution

Replace with an append-only **sync journal**:

```sql
CREATE TABLE sync_journal (
  id BIGSERIAL PRIMARY KEY,  -- Monotonic sequence number
  org_id UUID NOT NULL,
  file_id UUID REFERENCES files(id),
  event_type TEXT NOT NULL,  -- 'created', 'modified', 'deleted', 'moved', etc.
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);
```

Clients track `last_synced_sequence_id` and query: `SELECT * FROM sync_journal WHERE id > $last_seq ORDER BY id`

## Benefits

- No clock skew issues (monotonic IDs)
- Reliable offline→online sync
- Push via Supabase Realtime
- Full audit trail
- Resumable/debuggable sync
