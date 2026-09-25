import fs from 'fs'
import path from 'path'

export interface EDrawingsDiscoveryDependencies {
  exists: (candidate: string) => boolean
  listDirectories: (parent: string) => string[]
}

const PROGRAM_FILES = ['C:\\Program Files', 'C:\\Program Files (x86)']
const EXECUTABLE_NAMES = ['eDrawings.exe', 'EModelViewer.exe']

function candidatesIn(directory: string): string[] {
  return EXECUTABLE_NAMES.map((name) => path.win32.join(directory, name))
}

/**
 * Resolve the external eDrawings viewer without assuming a single installer
 * layout. Recent releases install below Common Files/eDrawingsYYYY, whereas
 * older releases used one of the SOLIDWORKS Corp paths.
 */
export function findEDrawingsExecutable(
  dependencies: EDrawingsDiscoveryDependencies = {
    exists: fs.existsSync,
    listDirectories: (parent) => {
      try {
        return fs.readdirSync(parent, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
      } catch {
        return []
      }
    },
  },
): string | null {
  const directories = [
    ...PROGRAM_FILES.flatMap((programFiles) => [
      path.win32.join(programFiles, 'SOLIDWORKS Corp', 'eDrawings'),
      path.win32.join(programFiles, 'eDrawings'),
      path.win32.join(programFiles, 'SOLIDWORKS Corp', 'SOLIDWORKS', 'eDrawings'),
    ]),
  ]

  for (const programFiles of PROGRAM_FILES) {
    const commonFiles = path.win32.join(programFiles, 'Common Files')
    for (const entry of dependencies.listDirectories(commonFiles)) {
      if (/^edrawings(?:\d{4})?$/i.test(entry)) {
        directories.push(path.win32.join(commonFiles, entry))
      }
    }
  }

  for (const candidate of directories.flatMap(candidatesIn)) {
    if (dependencies.exists(candidate)) return candidate
  }

  return null
}
