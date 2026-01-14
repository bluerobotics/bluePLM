<div align="center">

> ⚠️ **Disclaimer:** This project is under active development and is considered experimental. Features may change, and stability is not guaranteed. Use at your own risk.

[![Version](https://img.shields.io/github/v/release/bluerobotics/bluePLM)](https://github.com/bluerobotics/bluePLM/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/bluerobotics/bluePLM/release.yml)](https://github.com/bluerobotics/bluePLM/actions)
[![Downloads](https://img.shields.io/github/downloads/bluerobotics/bluePLM/total)](https://github.com/bluerobotics/bluePLM/releases)
[![License](https://img.shields.io/github/license/bluerobotics/bluePLM)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-blueplm.io-blue)](https://docs.blueplm.io)

</div>

## Quick Start

**[📚 Full Documentation →](https://docs.blueplm.io)**

### For Users

1. [Download BluePLM](https://github.com/bluerobotics/bluePLM/releases)
2. Enter the **Organization Code** from your admin
3. Sign in with Google
4. Connect to a vault and start working

See the [User Setup Guide](https://docs.blueplm.io/user-setup) for details.

### For Admins

1. Create a [Supabase](https://supabase.com) project
2. Run the database schema
3. Connect BluePLM and generate an Organization Code
4. Share the code with your team

See the [Admin Setup Guide](https://docs.blueplm.io/admin-setup) for step-by-step instructions.

## Building from Source

```bash
git clone https://github.com/bluerobotics/bluePLM.git
cd bluePLM
npm install
npm run dev      # Development with hot reload
npm run build    # Production build
```

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron app with hot reload |
| `npm run build` | Build production app |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run api` | Start REST API server |

## Tech Stack

| Component | Technologies |
|-----------|--------------|
| Desktop | Electron 34, React 19, TypeScript, Tailwind, Zustand |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| API | Fastify, Docker, OpenAPI |

## License

MIT — see [LICENSE](LICENSE)
