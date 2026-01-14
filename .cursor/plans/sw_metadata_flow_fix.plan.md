---
name: SW Metadata Flow Fix
overview: "Fix the metadata flow between BluePLM and SolidWorks so that: (1) properties are written to BOTH file-level AND configuration-level, (2) local-only files show SW metadata, and (3) drawings inherit metadata from referenced parts."
todos:
  - id: write-to-config-level
    content: "BUG FIX: Write properties to default config, not just file-level (fixes $PRPSHEET)"
    status: pending
  - id: local-only-extract
    content: Extract SW metadata for local-only files on selection/expand
    status: pending
  - id: drawing-inheritance
    content: For drawings, inherit metadata from referenced part when blank
    status: pending
  - id: test-workflow
    content: "Test complete workflow: part -> generate BR -> drawing -> check-in"
    status: pending
    dependencies:
      - write-to-config-level
      - local-only-extract
      - drawing-inheritance
---

# SolidWorks Metadata Flow Fix

## ROOT CAUSE IDENTIFIED

**The bug:** When BluePLM writes properties to a SolidWorks file without expanded configurations, it writes to **file-level only** (Custom tab). But `$PRPSHEET:"Number"` in drawings reads from **configuration-specific** properties, which are empty!

```
Current behavior (BROKEN):
┌─────────────────────────────────────────────────────────────────────┐
│  BluePLM writes to:     FILE-LEVEL (Custom tab)     ✓ Has data     │
│  $PRPSHEET reads from:  CONFIG-LEVEL (Config Specific) ✗ EMPTY!    │
└─────────────────────────────────────────────────────────────────────┘

Required behavior (FIX):
┌─────────────────────────────────────────────────────────────────────┐
│  BluePLM writes to:     BOTH file-level AND config-level           │
│  $PRPSHEET reads from:  CONFIG-LEVEL                  ✓ Has data   │
└─────────────────────────────────────────────────────────────────────┘
```

## Problem Summary

When creating a drawing from a part in SolidWorks, the BR number, description, and revision don't populate because:

1. **BUG: Properties written to wrong level** - When configs aren't expanded in BluePLM, `saveConfigsToSWFile()` writes to file-level only. `$PRPSHEET` reads from config-level, finds nothing.
2. **Local-only files show blank metadata** - BluePLM doesn't extract SolidWorks properties for local-only files during vault scanning
3. **Drawing doesn't inherit from part** - When check-in extracts metadata, it reads the drawing's own properties (blank/default) instead of the referenced part's properties

---

## Implementation Plan

### Phase 1: FIX - Write Properties to Config Level (CRITICAL)

**Goal:** When writing properties to a SW file, ALWAYS write to the default/active configuration (not just file-level).

**Root cause location:** `src/features/source/browser/hooks/useConfigHandlers.ts` lines 262-284

```typescript
// CURRENT CODE (BROKEN):
} else {
  // Single config or no configs loaded - save file-level properties
  const props: Record<string, string> = {}
  if (baseNumber) props['Number'] = baseNumber
  // ...
  const result = await window.electronAPI?.solidworks?.setProperties(file.path, props)
  // ^^^ No config name = writes to FILE LEVEL ONLY!
}
```

**Fix:** Before writing, get the active/default configuration name and write there:

```typescript
// FIXED CODE:
} else {
  // No configs loaded - get default config name and write to BOTH levels
  const props: Record<string, string> = {}
  if (baseNumber) props['Number'] = baseNumber
  if (baseDesc) props['Description'] = baseDesc
  if (revision) props['Revision'] = revision
  
  if (Object.keys(props).length > 0) {
    // Get the default configuration name from the file
    const configResult = await window.electronAPI?.solidworks?.getConfigurations(file.path)
    const defaultConfig = configResult?.data?.configurations?.find(c => c.isActive)?.name 
                       || configResult?.data?.configurations?.[0]?.name
                       || 'Default'
    
    // Write to config level (this is what $PRPSHEET reads!)
    const result = await window.electronAPI?.solidworks?.setProperties(file.path, props, defaultConfig)
    // ...
  }
}
```

**Files to modify:**
- [`src/features/source/browser/hooks/useConfigHandlers.ts`](src/features/source/browser/hooks/useConfigHandlers.ts) - Fix `saveConfigsToSWFile()` to write to config level

### Phase 2: Extract Metadata for Local-Only SW Files

**Goal:** Show metadata in file browser columns for local-only SolidWorks files (like new drawings).

**Approach:** On-demand extraction when file is selected or details panel opens.

**Files to modify:**
- [`src/features/source/browser/hooks/useFileOperations.ts`](src/features/source/browser/hooks/useFileOperations.ts) - Trigger extraction on selection
- [`src/stores/slices/filesSlice.ts`](src/stores/slices/filesSlice.ts) - Store extracted metadata

**Implementation:**
```typescript
// When selecting a local-only SW file, extract its metadata
async function onFileSelected(file: LocalFile) {
  const isLocalOnly = file.diffStatus === 'added' || (!file.pdmData && file.diffStatus !== 'cloud')
  const isSWFile = ['.sldprt', '.sldasm', '.slddrw'].includes(file.extension?.toLowerCase())
  
  if (isLocalOnly && isSWFile && !file.pendingMetadata) {
    const result = await window.electronAPI?.solidworks?.getProperties(file.path)
    if (result?.success) {
      updatePendingMetadata(file.path, {
        part_number: extractPartNumber(result.data),
        description: extractDescription(result.data),
        revision: extractRevision(result.data)
      })
    }
  }
}
```

### Phase 3: Drawing Metadata Inheritance from Referenced Part

**Goal:** When a drawing has blank properties, automatically inherit from the referenced part.

**This may already work** once Phase 1 is fixed - if the part's config-level properties are correct, the drawing's $PRPSHEET links will resolve automatically in SolidWorks.

**If still needed:** The SW service already has `ReadDrawingReferencedModelProperties()` in DocumentManagerAPI.cs. We can use this during extraction to fill in blank values.

---

## Detailed Implementation

### Task 1: Fix saveConfigsToSWFile() to write to config level

In `useConfigHandlers.ts`, modify the "no configs loaded" branch:

```typescript
// BEFORE (line ~262):
} else {
  // Single config or no configs loaded - save file-level properties
  const result = await window.electronAPI?.solidworks?.setProperties(file.path, props)
}

// AFTER:
} else {
  // No configs loaded - write to default configuration (not just file level!)
  // This is critical because $PRPSHEET reads from config level, not file level
  
  // First, get the default/active configuration name
  const configResult = await window.electronAPI?.solidworks?.getConfigurations(file.path)
  const configs = configResult?.data?.configurations || []
  const defaultConfigName = configs.find((c: any) => c.isActive)?.name 
                         || configs[0]?.name 
                         || 'Default'
  
  log.info('[ConfigHandlers]', 'Writing to default config (no configs expanded)', { 
    file: file.name, 
    config: defaultConfigName 
  })
  
  // Write to config level - this is what $PRPSHEET reads!
  const result = await window.electronAPI?.solidworks?.setProperties(file.path, props, defaultConfigName)
  if (result?.success) {
    successCount++
  } else {
    failedCount++
    log.error('[ConfigHandlers]', 'Failed to write to default config', { error: result?.error })
  }
}
```

### Task 2: Extract metadata for local-only files on selection

Add to file selection handler or create dedicated hook.

### Task 3: (If needed) Drawing inheritance fallback

Only implement if $PRPSHEET still doesn't work after Phase 1 fix.

---

## Testing Checklist

1. [ ] Generate BR# on part -> Check SW File Properties -> **Config Specific tab** has Number property
2. [ ] Create drawing from that part -> $PRPSHEET:"Number" resolves correctly in title block
3. [ ] Save new drawing -> BluePLM shows metadata in file browser columns
4. [ ] Check in drawing -> Metadata persists in database
5. [ ] Drawing revision matches part revision (not template default "x01")

---

## Priority Order

1. **Phase 1 (CRITICAL)** - Fix the config-level write bug. This is the root cause.
2. **Phase 2** - Extract metadata for local-only files (nice-to-have for immediate feedback)
3. **Phase 3** - Drawing inheritance (may be unnecessary once Phase 1 works)

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| getConfigurations call adds latency | Cache config names; most parts have 1 config anyway |
| Different config naming conventions | Fall back to 'Default' or first config |
| SW service not running | Existing error handling; queue for later |
