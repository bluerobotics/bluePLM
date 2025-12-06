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

## Supported Formats

| Category | Extensions |
|----------|------------|
| SolidWorks | `.sldprt`, `.sldasm`, `.slddrw` |
| CAD Exchange | `.step`, `.stp`, `.iges`, `.igs`, `.stl` |
| Documents | `.pdf`, `.xlsx`, `.csv` |
| Electronics | `.sch`, `.brd`, `.kicad_pcb` |

## Installation

Download the latest release for your platform from the [releases page](https://github.com/bluerobotics/blue-pdm/releases).

### Building from Source

```bash
git clone https://github.com/bluerobotics/blue-pdm.git
cd blue-pdm
npm install
npm run build
```

### Configuration

Create a `.env` file with your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run the schema from `supabase/schema.sql` in your Supabase SQL Editor.

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
