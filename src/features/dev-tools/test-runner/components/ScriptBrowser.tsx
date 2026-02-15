import { useState, useEffect, useCallback } from 'react'
import { Play, FolderOpen, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import type { ParsedTestScript, ScriptMetadata } from '@/lib/commands/testing/types'
import { ScriptListItem, type ScriptRunStatus } from './ScriptListItem'

interface ScriptBrowserProps {
  /** Current run status per script filename */
  scriptStatuses: Map<string, ScriptRunStatus>
  /** Called when the user clicks "Run All" (selected or all scripts) */
  onRunAll: (scripts: ParsedTestScript[]) => void
  /** Called when the user clicks the play button on a single script */
  onRunSingle: (script: ParsedTestScript) => void
  /** Whether any test is currently running */
  isRunning: boolean
}

/** Directory within the bundled repo that contains test scripts */
const TEST_SCRIPTS_DIR = 'tests/regression'

/**
 * Left panel: editable test folder name, script list, Run All button.
 * Reads .bptest files from the bundled tests/regression/ folder.
 */
export function ScriptBrowser({
  scriptStatuses,
  onRunAll,
  onRunSingle,
  isRunning,
}: ScriptBrowserProps) {
  const testFolderName = usePDMStore((s) => s.testFolderName)
  const setTestFolderName = usePDMStore((s) => s.setTestFolderName)
  const vaultPath = usePDMStore((s) => s.vaultPath)

  const [scripts, setScripts] = useState<ParsedTestScript[]>([])
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load test scripts from the bundled directory
  const loadScripts = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Use electronAPI to list test scripts; gracefully handle missing API
      if (!window.electronAPI?.listDirFiles) {
        setError('Electron API not available. Scripts cannot be loaded outside the desktop app.')
        setScripts([])
        return
      }

      // The test scripts live in the app bundle at tests/regression/
      // We'll try to read them via the file system API
      const appPath = await window.electronAPI.getVersion?.()
      if (!appPath) {
        setError('Could not determine application path')
        setScripts([])
        return
      }

      // Try listing the test scripts directory
      // The scripts are bundled with the app, so they're at a known location
      const result = await window.electronAPI.listDirFiles(TEST_SCRIPTS_DIR)

      if (!result.success || !result.files) {
        // Scripts directory doesn't exist yet — that's OK
        setScripts([])
        setError(
          result.error?.includes('ENOENT')
            ? `No test scripts found in ${TEST_SCRIPTS_DIR}/. Scripts will appear when the test engine is installed.`
            : result.error || 'Failed to list test scripts'
        )
        return
      }

      // Filter for .bptest files
      const testFiles = result.files.filter(
        (f) => !f.isDirectory && f.name.endsWith('.bptest')
      )

      if (testFiles.length === 0) {
        setScripts([])
        setError(`No .bptest files found in ${TEST_SCRIPTS_DIR}/`)
        return
      }

      // Parse each script file to extract metadata
      const parsed: ParsedTestScript[] = []

      for (const file of testFiles) {
        try {
          const readResult = await window.electronAPI.readFile(file.path)
          if (readResult.success && readResult.data) {
            // Decode base64 content from readFile
            const content = atob(readResult.data)
            const meta = parseScriptMetadata(content, file.name)
            parsed.push(meta)
          }
        } catch {
          // Skip files that can't be read
        }
      }

      setScripts(parsed)
      // Select all by default
      setSelectedSet(new Set(parsed.map((s) => s.sourceFile || '')))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScripts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  const toggleSelect = (sourceFile: string) => {
    setSelectedSet((prev) => {
      const next = new Set(prev)
      if (next.has(sourceFile)) {
        next.delete(sourceFile)
      } else {
        next.add(sourceFile)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedSet.size === scripts.length) {
      setSelectedSet(new Set())
    } else {
      setSelectedSet(new Set(scripts.map((s) => s.sourceFile || '')))
    }
  }

  const handleRunAll = () => {
    const toRun =
      selectedSet.size > 0
        ? scripts.filter((s) => selectedSet.has(s.sourceFile || ''))
        : scripts
    onRunAll(toRun)
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#30363d]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#30363d] bg-[#161b22] space-y-2 flex-shrink-0">
        {/* Test folder name input */}
        <div>
          <label className="block text-[10px] text-slate-500 font-mono mb-1">
            Test folder name
          </label>
          <input
            type="text"
            value={testFolderName}
            onChange={(e) => setTestFolderName(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-plm-accent"
            placeholder="0 - Tests"
          />
        </div>

        {/* Info text */}
        <div className="text-[10px] text-slate-600 font-mono leading-relaxed">
          <div className="flex items-center gap-1">
            <FolderOpen size={10} className="flex-shrink-0" />
            <span className="truncate">
              {vaultPath ? `${vaultPath}/${testFolderName}/` : `<vault>/${testFolderName}/`}
            </span>
          </div>
          <div className="mt-0.5">Auto-created at run start, destroyed after run.</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#30363d] bg-[#161b22] flex-shrink-0">
        <button
          onClick={handleRunAll}
          disabled={isRunning || scripts.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Play size={11} />
          )}
          {isRunning ? 'Running...' : selectedSet.size > 0 ? `Run ${selectedSet.size} Selected` : 'Run All'}
        </button>

        <button
          onClick={loadScripts}
          disabled={loading}
          className="p-1 rounded hover:bg-[#30363d] text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          title="Refresh scripts"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>

        {scripts.length > 0 && (
          <label className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={selectedSet.size === scripts.length}
              onChange={toggleSelectAll}
              className="w-3 h-3 rounded border-[#30363d] bg-[#0d1117] text-plm-accent focus:ring-0"
            />
            All
          </label>
        )}
      </div>

      {/* Script list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-24 text-slate-500">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="px-3 py-4 text-xs text-slate-500 font-mono">
            <AlertCircle size={14} className="text-amber-500 mb-2" />
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && scripts.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-600 font-mono text-center">
            No scripts loaded
          </div>
        )}

        {!loading &&
          scripts.map((script) => {
            const key = script.sourceFile || script.metadata.name
            return (
              <ScriptListItem
                key={key}
                script={script}
                status={scriptStatuses.get(key) || 'idle'}
                selected={selectedSet.has(script.sourceFile || '')}
                onToggleSelect={() => toggleSelect(script.sourceFile || '')}
                onRun={() => onRunSingle(script)}
              />
            )
          })}
      </div>
    </div>
  )
}

// ============================================================================
// Lightweight metadata parser
// ============================================================================

/**
 * Parses minimal metadata from a .bptest file header.
 * Looks for @name, @requires, @timeout in comment lines at the top.
 */
function parseScriptMetadata(content: string, filename: string): ParsedTestScript {
  const lines = content.split('\n')
  const metadata: ScriptMetadata = {
    name: filename.replace(/\.bptest$/, ''),
    requires: [],
    timeout: 30000,
  }

  const sections: ParsedTestScript['sections'] = []
  let currentSection: ParsedTestScript['sections'][number] | null = null
  let teardown: ParsedTestScript['teardown'] = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Metadata lines (# @key value)
    if (line.startsWith('#')) {
      const metaMatch = line.match(/^#\s*@(\w+)\s+(.+)$/)
      if (metaMatch) {
        const [, key, value] = metaMatch
        switch (key) {
          case 'name':
            metadata.name = value.trim()
            break
          case 'requires':
            metadata.requires = value
              .split(',')
              .map((r) => r.trim())
              .filter(Boolean)
            break
          case 'timeout':
            metadata.timeout = parseInt(value, 10) || 30000
            break
        }
      }
      continue
    }

    // Section headers: [Section Name] or [teardown]
    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim()
      if (sectionName.toLowerCase() === 'teardown') {
        teardown = { name: 'teardown', commands: [] }
        currentSection = teardown
      } else {
        const newSection = { name: sectionName, commands: [] }
        sections.push(newSection)
        currentSection = newSection
      }
      continue
    }

    // Command lines (non-empty, non-comment)
    if (line && currentSection) {
      currentSection.commands.push({ line: i + 1, raw: line })
    }
  }

  return {
    metadata,
    sections,
    teardown,
    sourceFile: filename,
  }
}
