# BluePLM Documentation

BluePLM is a desktop application for managing engineering files across teams. It uses Supabase as its cloud backend for authentication, file storage, and real-time sync.

**Website:** [blueplm.io](https://blueplm.io) • **GitHub:** [bluerobotics/bluePLM](https://github.com/bluerobotics/bluePLM)

## How It Works

1. **Admin** creates a Supabase project and configures BluePLM
2. Admin generates an **Organization Code** to share with the team
3. **Team members** download BluePLM and enter the code to connect
4. Everyone signs in with Google, email, or phone
5. Connect to **Vaults** to start working with files

## First Launch

When you first open BluePLM, you'll go through:

1. **Language selection** — Choose your preferred language
2. **Usage statistics** — Opt in/out of anonymous analytics

Then you'll see the **Setup Screen** where you choose your role.

## Get Started

- **Setting up for your team?** → [Admin Setup Guide](/admin-setup)
- **Joining an existing organization?** → [User Setup Guide](/user-setup)

## Learn More

- [Explorer Interface](/source-files/explorer) — Navigate and manage files
- [Understanding Vaults](/source-files/vaults) — File organization
- [Settings Overview](/settings/) — Configuration options
- [Integrations](/settings/integrations) — SolidWorks, Google Drive, Odoo

## For Developers

- [Extension Development](/extensions/) — Build extensions for BluePLM
- [Getting Started](/extensions/getting-started) — Create your first extension
- [API Reference](/extensions/client-api) — Client and Server APIs