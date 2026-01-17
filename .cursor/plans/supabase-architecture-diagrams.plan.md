# Supabase Architecture - Visual Reference

This plan file contains comprehensive diagrams of the bluePLM Supabase architecture for easy viewing.

---

## 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client [Electron Desktop App]
        UI[React UI Components]
        Zustand[Zustand State Store]
        SupaClient[Supabase Client]
        FileSync[File Syncer]
        LocalFS[(Local Filesystem)]
    end
    
    subgraph Supabase [Supabase Cloud Backend]
        Auth[Auth Service]
        DB[(PostgreSQL Database)]
        Storage[Storage Buckets]
        Realtime[Realtime Server]
        Edge[Edge Functions]
    end
    
    subgraph External [External Services]
        Google[Google OAuth]
        ERP[ERP Systems]
        Webhooks[Webhook Endpoints]
    end
    
    UI --> Zustand
    Zustand --> SupaClient
    SupaClient --> Auth
    SupaClient --> DB
    SupaClient --> Storage
    SupaClient --> Realtime
    
    FileSync --> LocalFS
    FileSync --> Storage
    FileSync --> DB
    
    Auth --> Google
    Edge --> ERP
    DB --> Webhooks
    
    Realtime -.->|Live Updates| SupaClient
```

---

## 2. Database Module Architecture

```mermaid
flowchart LR
    subgraph core [core.sql - Foundation]
        orgs[organizations]
        users[users]
        teams[teams]
        perms[permissions]
        notif[notifications]
    end
    
    subgraph sf [10-source-files.sql]
        vaults[vaults]
        files[files]
        versions[file_versions]
        refs[file_references]
        workflows[workflows]
        activity[activity]
    end
    
    subgraph cc [20-change-control.sql]
        ecos[ecos]
        reviews[reviews]
        deviations[deviations]
        process[process_templates]
    end
    
    subgraph sc [30-supply-chain.sql]
        suppliers[suppliers]
        rfqs[rfqs]
        quotes[rfq_quotes]
        pricing[part_suppliers]
    end
    
    subgraph int [40-integrations.sql]
        webhooks[webhooks]
        odoo[odoo_configs]
        woo[woocommerce]
        sw[solidworks_licenses]
    end
    
    subgraph ext [50-extensions.sql]
        installed[org_installed_extensions]
        storage[extension_storage]
        secrets[extension_secrets]
    end
    
    core --> sf
    core --> cc
    core --> sc
    core --> int
    core --> ext
    sf --> cc
    sf --> sc
```

---

## 3. Core Schema Entity Relationships

```mermaid
erDiagram
    organizations ||--o{ users : employs
    organizations ||--o{ teams : contains
    organizations ||--o{ blocked_users : blocks
    organizations ||--o{ pending_org_members : invites
    organizations ||--o{ job_titles : defines
    organizations ||--o{ admin_recovery_codes : has
    
    users ||--o{ team_members : belongs_to
    users ||--o{ user_permissions : granted
    users ||--o{ user_job_titles : assigned
    users ||--o{ user_sessions : has
    users ||--o{ notifications : receives
    users ||--o{ color_swatches : owns
    
    teams ||--o{ team_members : contains
    teams ||--o{ team_permissions : grants
    teams }o--o| teams : parent_of
    
    job_titles ||--o{ user_job_titles : assigned_to
    
    organizations {
        uuid id PK
        text name
        text slug UK
        text[] email_domains
        jsonb settings
        jsonb auth_providers
    }
    
    users {
        uuid id PK
        text email UK
        text full_name
        uuid org_id FK
        user_role role
    }
    
    teams {
        uuid id PK
        uuid org_id FK
        text name
        uuid parent_team_id FK
        boolean is_system
    }
```

---

## 4. Source Files Module Entity Relationships

```mermaid
erDiagram
    organizations ||--o{ vaults : contains
    vaults ||--o{ files : stores
    vaults ||--o{ vault_access : grants
    vaults ||--o{ team_vault_access : grants
    
    files ||--o{ file_versions : has
    files ||--o{ file_references : parent_of
    files ||--o{ file_references : child_of
    files ||--o{ file_watchers : watched_by
    files ||--o{ file_share_links : shared_via
    files ||--o{ file_comments : has
    files ||--o{ release_files : generates
    files ||--o{ activity : logs
    
    workflow_templates ||--o{ workflow_states : contains
    workflow_templates ||--o{ workflow_transitions : has
    workflow_states ||--o{ workflow_transitions : from
    workflow_states ||--o{ workflow_transitions : to
    workflow_transitions ||--o{ workflow_gates : requires
    
    files ||--o{ file_workflow_assignments : assigned
    file_workflow_assignments }o--|| workflow_templates : uses
    
    vaults {
        uuid id PK
        uuid org_id FK
        text name
        text local_path
        text storage_bucket
    }
    
    files {
        uuid id PK
        uuid vault_id FK
        text file_path
        text file_name
        text part_number
        text revision
        integer version
        text content_hash
        uuid checked_out_by FK
        uuid workflow_state_id FK
    }
    
    file_versions {
        uuid id PK
        uuid file_id FK
        integer version
        text revision
        text content_hash
    }
    
    file_references {
        uuid id PK
        uuid parent_file_id FK
        uuid child_file_id FK
        integer quantity
        text configuration
    }
```

---

## 5. Workflow System Architecture

```mermaid
flowchart TB
    subgraph Templates [Workflow Template]
        WT[workflow_templates]
    end
    
    subgraph States [States and Gates]
        WIP[WIP State]
        Review[In Review State]
        Released[Released State]
        Obsolete[Obsolete State]
    end
    
    subgraph Transitions [Transitions]
        T1[Submit for Review]
        T2[Approve]
        T3[Reject]
        T4[Revise]
        T5[Obsolete]
    end
    
    subgraph Gates [Gate Requirements]
        G1[Approval Gate]
        G2[Checklist Gate]
    end
    
    WT --> WIP
    WT --> Review
    WT --> Released
    WT --> Obsolete
    
    WIP -->|T1| Review
    Review -->|T2| Released
    Review -->|T3| WIP
    Released -->|T4| WIP
    Released -->|T5| Obsolete
    
    T2 --> G1
    T2 --> G2
```

---

## 6. Change Control Module Entity Relationships

```mermaid
erDiagram
    organizations ||--o{ ecos : has
    organizations ||--o{ deviations : has
    organizations ||--o{ reviews : has
    organizations ||--o{ process_templates : defines
    
    ecos ||--o{ file_ecos : includes
    ecos ||--o{ eco_checklist_items : tracks
    ecos ||--o{ eco_gate_approvals : requires
    ecos }o--o| process_templates : follows
    
    files ||--o{ file_ecos : linked_to
    files ||--o{ reviews : reviewed_by
    files ||--o{ file_deviations : has
    
    deviations ||--o{ file_deviations : applies_to
    
    reviews ||--o{ review_responses : receives
    users ||--o{ review_responses : submits
    
    process_templates ||--o{ process_template_phases : contains
    process_template_phases ||--o{ process_template_items : has
    
    ecos {
        uuid id PK
        uuid org_id FK
        text eco_number UK
        text title
        eco_status status
        uuid process_template_id FK
    }
    
    reviews {
        uuid id PK
        uuid file_id FK
        uuid requested_by FK
        review_status status
        timestamptz due_date
    }
    
    deviations {
        uuid id PK
        text deviation_number UK
        text title
        deviation_status status
        text[] affected_part_numbers
    }
```

---

## 7. Supply Chain Module Entity Relationships

```mermaid
erDiagram
    organizations ||--o{ suppliers : manages
    organizations ||--o{ rfqs : creates
    organizations ||--o{ organization_addresses : has
    
    suppliers ||--o{ supplier_contacts : employs
    suppliers ||--o{ supplier_invitations : receives
    suppliers ||--o{ part_suppliers : provides
    suppliers ||--o{ rfq_suppliers : quoted_on
    suppliers ||--o{ rfq_quotes : submits
    
    files ||--o{ part_suppliers : sourced_from
    files ||--o{ rfq_items : included_in
    
    rfqs ||--o{ rfq_items : contains
    rfqs ||--o{ rfq_suppliers : sent_to
    rfqs ||--o{ rfq_activity : logs
    rfqs }o--o| organization_addresses : bills_to
    rfqs }o--o| organization_addresses : ships_to
    
    rfq_items ||--o{ rfq_quotes : quoted
    
    suppliers {
        uuid id PK
        uuid org_id FK
        text name
        text code UK
        boolean is_approved
    }
    
    rfqs {
        uuid id PK
        text rfq_number UK
        text title
        rfq_status status
        date due_date
        uuid awarded_supplier_id FK
    }
    
    part_suppliers {
        uuid id PK
        uuid file_id FK
        uuid supplier_id FK
        decimal unit_price
        boolean is_preferred
    }
```

---

## 8. Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Electron as Electron App
    participant Browser as System Browser
    participant Supabase as Supabase Auth
    participant DB as PostgreSQL
    
    User->>Electron: Click "Sign In with Google"
    Electron->>Supabase: signInWithOAuth()
    Supabase-->>Electron: OAuth URL with redirect
    Electron->>Browser: shell.openExternal(url)
    
    User->>Browser: Authenticate with Google
    Browser->>Supabase: OAuth callback
    Supabase->>Supabase: Validate OAuth token
    Supabase->>DB: handle_new_user() trigger
    
    Note over DB: Create user record<br/>Check pending_org_members<br/>Apply team memberships
    
    Supabase-->>Electron: Session tokens via deep link
    Electron->>Electron: setSession(tokens)
    Electron->>DB: ensure_user_org_id()
    DB-->>Electron: User profile + org
    
    Electron->>User: Show dashboard
```

---

## 9. File Sync and Storage Flow

```mermaid
sequenceDiagram
    participant Local as Local Filesystem
    participant App as Electron App
    participant Hash as Hash Calculator
    participant Storage as Supabase Storage
    participant DB as PostgreSQL
    participant RT as Realtime
    
    Local->>App: File modified event
    App->>Hash: Calculate SHA-256
    Hash-->>App: content_hash
    
    App->>Storage: HEAD /vault/{org_id}/{hash}
    
    alt Hash not found in storage
        App->>Storage: PUT /vault/{org_id}/{hash}
        Storage-->>App: Upload complete
    end
    
    App->>DB: UPSERT files (path, hash, metadata)
    DB-->>App: File record
    
    App->>DB: INSERT file_versions
    DB-->>App: Version record
    
    DB->>RT: Broadcast INSERT/UPDATE
    RT-->>App: Realtime notification
    
    Note over App: Other clients<br/>receive update
```

---

## 10. Checkout/Checkin Flow with Conflict Prevention

```mermaid
sequenceDiagram
    participant UserA as User A
    participant UserB as User B
    participant RPC as checkout_file RPC
    participant DB as PostgreSQL
    participant RT as Realtime
    
    UserA->>RPC: checkout_file(file_id, user_id)
    
    Note over RPC: BEGIN TRANSACTION<br/>SELECT FOR UPDATE
    
    RPC->>DB: Check checked_out_by IS NULL
    DB-->>RPC: File available
    RPC->>DB: UPDATE files SET checked_out_by = user_a
    DB-->>RPC: Lock acquired
    RPC-->>UserA: Success + file data
    
    DB->>RT: Broadcast UPDATE
    RT-->>UserA: File locked by you
    RT-->>UserB: File locked by User A
    
    Note over UserA: Edit file locally
    
    UserB->>RPC: checkout_file(file_id, user_id)
    RPC->>DB: Check checked_out_by
    DB-->>RPC: Already locked by User A
    RPC-->>UserB: Error: File checked out
    
    UserA->>RPC: checkin_file(file_id, new_hash)
    RPC->>DB: Release lock + create version
    DB-->>RPC: Version created
    RPC-->>UserA: Success + new version
    
    DB->>RT: Broadcast UPDATE
    RT-->>UserA: File released
    RT-->>UserB: New version available
```

---

## 11. Realtime Subscription Architecture

```mermaid
flowchart TB
    subgraph App [Electron App]
        Store[Zustand Store]
        Subs[Subscription Manager]
    end
    
    subgraph Channels [Realtime Channels]
        FC[files:orgId]
        AC[activity:orgId]
        OC[organization:orgId]
        VC[vaults:orgId]
        NC[notifications:userId]
        PC[permissions:userId]
        MC[member_changes:orgId]
    end
    
    subgraph Tables [PostgreSQL Tables]
        Files[(files)]
        Activity[(activity)]
        Orgs[(organizations)]
        Vaults[(vaults)]
        Notif[(notifications)]
        VA[(vault_access)]
        TM[(team_members)]
    end
    
    Store --> Subs
    Subs --> FC
    Subs --> AC
    Subs --> OC
    Subs --> VC
    Subs --> NC
    Subs --> PC
    Subs --> MC
    
    Files -->|INSERT/UPDATE/DELETE| FC
    Activity -->|INSERT| AC
    Orgs -->|UPDATE| OC
    Vaults -->|INSERT/UPDATE/DELETE| VC
    Notif -->|INSERT/UPDATE| NC
    VA -->|INSERT/DELETE| PC
    TM -->|INSERT/DELETE| PC
    TM -->|INSERT/UPDATE/DELETE| MC
```

---

## 12. Permission Hierarchy and Access Control

```mermaid
flowchart TD
    subgraph Roles [User Roles]
        Admin[Admin Role]
        Engineer[Engineer Role]
        Viewer[Viewer Role]
    end
    
    subgraph Teams [Team Structure]
        AdminTeam[Administrators Team]
        EngTeam[Engineering Team]
        ViewTeam[Viewers Team]
    end
    
    subgraph Permissions [Permission Types]
        View[view]
        Create[create]
        Edit[edit]
        Delete[delete]
        AdminPerm[admin]
    end
    
    subgraph Resources [Resources]
        ModExplorer[module:explorer]
        ModWorkflows[module:workflows]
        ModECO[module:eco]
        ModRFQ[module:rfq]
        SystemTeams[system:teams]
        SystemUsers[system:users]
    end
    
    Admin --> AdminTeam
    Engineer --> EngTeam
    Viewer --> ViewTeam
    
    AdminTeam --> AdminPerm
    EngTeam --> View
    EngTeam --> Create
    EngTeam --> Edit
    ViewTeam --> View
    
    AdminPerm --> ModExplorer
    AdminPerm --> ModWorkflows
    AdminPerm --> ModECO
    AdminPerm --> ModRFQ
    AdminPerm --> SystemTeams
    AdminPerm --> SystemUsers
```

---

## 13. RLS Policy Decision Flow

```mermaid
flowchart TD
    Start[Query Request] --> Auth{Authenticated?}
    Auth -->|No| Deny[Access Denied]
    Auth -->|Yes| GetUser[Get auth.uid]
    
    GetUser --> GetOrg[Get user org_id]
    GetOrg --> OrgMatch{Row org_id matches?}
    
    OrgMatch -->|No| Deny
    OrgMatch -->|Yes| IsAdmin{is_org_admin?}
    
    IsAdmin -->|Yes| Allow[Allow Access]
    IsAdmin -->|No| CheckPerm{user_has_team_permission?}
    
    CheckPerm -->|Yes| Allow
    CheckPerm -->|No| CheckOwner{Is row owner?}
    
    CheckOwner -->|Yes| Allow
    CheckOwner -->|No| Deny
```

---

## 14. Storage Architecture - Content Addressable

```mermaid
flowchart TB
    subgraph Input [File Input]
        File1[Part1.SLDPRT - 2MB]
        File2[Part1.SLDPRT - 2MB copy]
        File3[Part2.SLDPRT - 3MB]
    end
    
    subgraph Hash [SHA-256 Hashing]
        H1[abc123...]
        H2[abc123...]
        H3[def456...]
    end
    
    subgraph Storage [Supabase Storage]
        Bucket[vault bucket]
        subgraph OrgFolder [org_id/]
            subgraph Shard1 [ab/]
                Obj1[abc123...]
            end
            subgraph Shard2 [de/]
                Obj2[def456...]
            end
        end
    end
    
    subgraph DB [PostgreSQL files table]
        Row1[file_id_1 -> abc123]
        Row2[file_id_2 -> abc123]
        Row3[file_id_3 -> def456]
    end
    
    File1 --> H1
    File2 --> H2
    File3 --> H3
    
    H1 --> Obj1
    H2 -.->|Deduplicated| Obj1
    H3 --> Obj2
    
    Row1 --> Obj1
    Row2 --> Obj1
    Row3 --> Obj2
```

---

## 15. BYOB (Bring Your Own Backend) Configuration

```mermaid
sequenceDiagram
    participant Admin as Org Admin
    participant App as bluePLM App
    participant Config as Config Storage
    participant Supabase as Supabase Project
    
    Admin->>Supabase: Create Supabase project
    Supabase-->>Admin: URL + anon key
    
    Admin->>App: Settings > Generate Org Code
    App->>App: Encode config to org code
    
    Note over App: PDM-XXXX-XXXX-XXXX<br/>Contains: URL, key, slug
    
    App-->>Admin: Org code to share
    
    Admin->>Admin: Share code with team
    
    participant User as Team Member
    User->>App: Enter org code
    App->>App: parseOrgCode()
    App->>Config: saveConfig()
    App->>App: reconfigureSupabase(url, key)
    App->>Supabase: validateConfig()
    Supabase-->>App: Connection OK
    App->>User: Ready to sign in
```

---

## 16. Webhook Delivery System

```mermaid
flowchart TB
    subgraph Trigger [Event Triggers]
        FileEvent[File Event]
        ECOEvent[ECO Event]
        RFQEvent[RFQ Event]
    end
    
    subgraph Matcher [Webhook Matcher]
        Match{Match webhooks<br/>by event type}
        Filter{Apply user filters}
    end
    
    subgraph Queue [Delivery Queue]
        Pending[webhook_deliveries<br/>status: pending]
    end
    
    subgraph Delivery [HTTP Delivery]
        Sign[Sign payload with secret]
        Send[POST to webhook URL]
        Record[Record response]
    end
    
    subgraph Retry [Retry Logic]
        Check{Success?}
        Schedule[Schedule retry<br/>exponential backoff]
        MaxRetry{Max retries?}
        Failed[Mark failed]
    end
    
    FileEvent --> Match
    ECOEvent --> Match
    RFQEvent --> Match
    
    Match -->|Events match| Filter
    Filter -->|Pass| Pending
    
    Pending --> Sign
    Sign --> Send
    Send --> Record
    Record --> Check
    
    Check -->|No| Schedule
    Schedule --> MaxRetry
    MaxRetry -->|No| Pending
    MaxRetry -->|Yes| Failed
    Check -->|Yes| Success[Mark success]
```

---

## 17. Extension System Architecture

```mermaid
flowchart TB
    subgraph Extension [Extension Package .bpx]
        Manifest[extension.json]
        Client[client/ React components]
        Server[server/ handlers]
        Assets[icon.png, assets/]
    end
    
    subgraph Install [Installation]
        Upload[Upload .bpx file]
        Parse[Parse manifest]
        Store[Store in org_installed_extensions]
    end
    
    subgraph Runtime [Runtime]
        Load[Load handlers]
        Sandbox[Isolated execution]
        API[Extension API access]
    end
    
    subgraph Services [Extension Services]
        Storage[(extension_storage)]
        Secrets[(extension_secrets)]
        HTTP[HTTP with allowlist]
        Config[(org_extension_config)]
    end
    
    Extension --> Upload
    Upload --> Parse
    Parse --> Store
    
    Store --> Load
    Load --> Sandbox
    Sandbox --> API
    
    API --> Storage
    API --> Secrets
    API --> HTTP
    API --> Config
```

---

## 18. Complete Database Schema Overview

```mermaid
erDiagram
    %% Core
    organizations ||--o{ users : has
    organizations ||--o{ teams : has
    organizations ||--o{ vaults : has
    organizations ||--o{ ecos : has
    organizations ||--o{ suppliers : has
    organizations ||--o{ rfqs : creates
    organizations ||--o{ webhooks : configures
    organizations ||--o{ org_installed_extensions : installs
    
    %% Users
    users ||--o{ team_members : joins
    users ||--o{ notifications : receives
    users ||--o{ user_sessions : has
    
    %% Teams
    teams ||--o{ team_members : contains
    teams ||--o{ team_permissions : grants
    teams ||--o{ team_vault_access : accesses
    
    %% Files
    vaults ||--o{ files : stores
    files ||--o{ file_versions : tracks
    files ||--o{ file_references : links
    files ||--o{ activity : logs
    files ||--o{ reviews : reviewed
    files ||--o{ file_ecos : tagged
    files ||--o{ part_suppliers : sourced
    files ||--o{ rfq_items : quoted
    
    %% Workflows
    workflow_templates ||--o{ workflow_states : defines
    workflow_states ||--o{ workflow_transitions : connects
    files ||--o{ file_workflow_assignments : assigned
    
    %% Change Control
    ecos ||--o{ file_ecos : includes
    ecos ||--o{ eco_checklist_items : tracks
    reviews ||--o{ review_responses : collects
    
    %% Supply Chain
    suppliers ||--o{ part_suppliers : provides
    suppliers ||--o{ rfq_suppliers : responds
    rfqs ||--o{ rfq_items : contains
    rfqs ||--o{ rfq_quotes : receives
    
    %% Integrations
    webhooks ||--o{ webhook_deliveries : delivers
    
    %% Extensions
    org_installed_extensions ||--o{ extension_storage : uses
    org_installed_extensions ||--o{ extension_secrets : stores
```

---

## Summary

This plan file contains **18 comprehensive diagrams** covering:

1. **System Architecture** - High-level component overview
2. **Module Dependencies** - How SQL modules relate
3. **Core Schema ERD** - Organizations, users, teams
4. **Source Files ERD** - Files, vaults, workflows
5. **Workflow System** - States, transitions, gates
6. **Change Control ERD** - ECOs, reviews, deviations
7. **Supply Chain ERD** - Suppliers, RFQs, quotes
8. **Auth Flow** - Google OAuth sequence
9. **File Sync Flow** - Upload with deduplication
10. **Checkout Flow** - Lock acquisition with conflict prevention
11. **Realtime Architecture** - Channels and subscriptions
12. **Permission Hierarchy** - Roles and access levels
13. **RLS Decision Flow** - Policy evaluation
14. **Storage Architecture** - Content-addressable storage
15. **BYOB Configuration** - Multi-tenant setup
16. **Webhook System** - Event delivery with retries
17. **Extension System** - Plugin architecture
18. **Complete Schema Overview** - All module relationships

All diagrams use Mermaid syntax and will render in the Cursor plan viewer.
