# BluePDM

Product Data Management for engineering teams. Built with Electron, React, and Supabase.

![BluePDM Screenshot](assets/screenshot.png)

[![Version](https://img.shields.io/github/v/release/bluerobotics/blue-pdm)](https://github.com/bluerobotics/blue-pdm/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/bluerobotics/blue-pdm/release.yml)](https://github.com/bluerobotics/blue-pdm/actions)
[![Downloads](https://img.shields.io/github/downloads/bluerobotics/blue-pdm/total)](https://github.com/bluerobotics/blue-pdm/releases)
[![License](https://img.shields.io/github/license/bluerobotics/blue-pdm)](LICENSE)

## Features

- **Check In / Check Out** with exclusive file locking
- **Version control** with full history and rollback
- **File state management** (WIP, In Review, Released, Obsolete)
- **SolidWorks integration** with thumbnail previews
- **Where-used analysis** for tracking assembly references
- **Cloud sync** via Supabase with real-time collaboration
- **Offline mode** for local-only workflows

## Getting Started as a New User

1. **Download** the latest release from the [releases page](https://github.com/bluerobotics/blue-pdm/releases)
2. **Install** and launch BluePDM
3. **Enter your organization's Supabase credentials** (your admin will provide these)
4. **Sign in with Google** using your work email
5. **Connect to a vault** from the Organization tab

That's it! You can now check out files, make changes, and check them back in.

## Getting Started as a New Org / Admin

### 1. Create a Supabase Project

1. Sign up at [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon/public key** from Settings → API

### 2. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID (Web application)
3. Add `https://your-project.supabase.co/auth/v1/callback` to Authorized redirect URIs
4. In Supabase: Authentication → Providers → Google → Enable and paste your Client ID/Secret
5. Add `http://localhost` to Supabase's Redirect URLs (for the Electron app)

### 3. Set Up Storage

1. In Supabase: Storage → New Bucket → Name it `vault` → Set to **Private**

### 4. Run the Database Schema

1. Go to SQL Editor in Supabase
2. Copy and run the contents of [`supabase/schema.sql`](supabase/schema.sql)

### 5. Create Your Organization

```sql
INSERT INTO organizations (name, slug, email_domains)
VALUES ('Your Company', 'your-company', ARRAY['yourcompany.com']);
```

Replace with your company name and email domain. Users signing in with emails matching that domain will automatically join your organization.

### 6. Share Credentials with Your Team

Give your team members:
- Your Supabase **Project URL** 
- Your Supabase **anon/public key**

They'll enter these on first launch of BluePDM.

### 7. Create Vaults

Once signed in as admin, go to **Settings → Organization** to create vaults for your team.

## Building from Source

```bash
git clone https://github.com/bluerobotics/blue-pdm.git
cd blue-pdm
npm install
npm run build
```

For development with hot reload:

```bash
npm run dev
```

### Environment Variables (Optional)

For development, create a `.env` file:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## File Storage

Local vaults are stored in platform-specific locations:

| Platform | Path |
|----------|------|
| Windows | `C:\BluePDM\{vault-name}` |
| macOS | `~/Documents/BluePDM/{vault-name}` |
| Linux | `~/BluePDM/{vault-name}` |

## Tech Stack

- Electron 34
- React 19
- TypeScript
- Tailwind CSS
- Zustand
- Supabase (PostgreSQL, Auth, Storage)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

[Blue Robotics](https://bluerobotics.com)
