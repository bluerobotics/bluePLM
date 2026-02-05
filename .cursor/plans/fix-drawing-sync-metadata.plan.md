---
name: fix-drawing-sync-metadata
overview: Write config description and tab number to SW file immediately on edit commit (blur/Enter), so sync-metadata always reads fresh data.
todos:
  - id: write-config-desc-immediately
    content: Modify handleConfigDescriptionChange to write description to SW file immediately via setProperties
    status: pending
  - id: write-config-tab-immediately
    content: Modify handleConfigTabChange to write tab number to SW file immediately via setProperties
    status: pending
  - id: test-sync-metadata
    content: Test that editing config description/tab writes to SW file immediately, and sync-metadata on drawing reads the updated values
    status: pending
---

# Fix Config Description Not Syncing to Drawing

## Problem Analysis

When a user edits a description on a configuration row of a part/assembly in BluePLM, the edit is stored only in memory (`pendingMetadata.config_descriptions`). When the user then runs "Sync Metadata" on a drawing that references that part's configuration, the command reads from the **disk file** (via `getProperties`) which has the OLD description.

**Current Flow** (broken):

1. User edits description on config row of `stator.SLDPRT` - stored ONLY in memory
2. User right-clicks drawing `stator.SLDDRW`, clicks "Sync Metadata"
3. `pullDrawingMetadata()` reads parent model properties from disk via `getProperties()`
4. Disk still has old description - sync-metadata pulls stale data to drawing

**Why "Generate BR Number" works**: It calls `saveConfigsToSWFile()` which writes ALL pending metadata (including `config_descriptions`) to the SW file, so sync-metadata reads the updated value.

## Solution

**Write config description to SW file immediately** when the user commits the edit (blur or Enter). This keeps the SW file as the single source of truth and ensures sync-metadata always reads fresh data.

## Implementation

### File: [src/features/source/browser/hooks/useConfigHandlers.ts](src/features/source/browser/hooks/useConfigHandlers.ts)

#### 1. Modify `handleConfigDescriptionChange` (lines 273-292)

Add immediate write to SW file via `setProperties`:

```typescript
const handleConfigDescriptionChange = useCallback(async (filePath: string, configName: string, value: string) => {
  const { files, fileConfigurations } = usePDMStore.getState()
  
  const file = files.find(f => f.path === filePath)
  if (!file) return
  
  // Update config in store (for immediate UI feedback)
  const configs = fileConfigurations.get(filePath)
  if (configs) {
    const updated = configs.map(c => c.name === configName ? { ...c, description: value } : c)
    usePDMStore.getState().setFileConfigurations(filePath, updated)
  }
  
  // Update pending metadata (for persistence across app restart)
  const existingDescs = file.pendingMetadata?.config_descriptions || {}
  usePDMStore.getState().updatePendingMetadata(filePath, {
    config_descriptions: { ...existingDescs, [configName]: value }
  })
  
  // Write to SW file immediately
  try {
    const result = await window.electronAPI?.solidworks?.setProperties(filePath, { 'Description': value }, configName)
    if (result?.success) {
      addToast('success', `Saved description to ${configName}`)
    } else {
      addToast('error', `Failed to save description: ${result?.error || 'Unknown error'}`)
    }
  } catch (err) {
    log.error('[ConfigHandlers]', 'Failed to write config description to SW file', { filePath, configName, error: err })
    addToast('error', 'Failed to save description to file')
  }
}, [addToast])
```

#### 2. Modify `handleConfigTabChange` (lines 247-266)

Add immediate write to SW file via `setProperties`. Also need to recalculate the full `Number` property (base + tab):

```typescript
const handleConfigTabChange = useCallback(async (filePath: string, configName: string, value: string) => {
  const { files, fileConfigurations } = usePDMStore.getState()
  
  const file = files.find(f => f.path === filePath)
  if (!file) return
  
  const upperValue = value.toUpperCase()
  
  // Update config in store
  const configs = fileConfigurations.get(filePath)
  if (configs) {
    const updated = configs.map(c => c.name === configName ? { ...c, tabNumber: upperValue } : c)
    usePDMStore.getState().setFileConfigurations(filePath, updated)
  }
  
  // Update pending metadata
  const existingTabs = file.pendingMetadata?.config_tabs || {}
  usePDMStore.getState().updatePendingMetadata(filePath, {
    config_tabs: { ...existingTabs, [configName]: upperValue }
  })
  
  // Write to SW file immediately
  try {
    const baseNumber = file.pendingMetadata?.part_number ?? file.pdmData?.part_number ?? ''
    const props: Record<string, string> = { 'Tab Number': upperValue }
    
    // Also update the full Number property (base + tab)
    if (baseNumber && upperValue) {
      props['Number'] = `${baseNumber}-${upperValue}`  // TODO: use serialization settings for separator
    }
    
    const result = await window.electronAPI?.solidworks?.setProperties(filePath, props, configName)
    if (result?.success) {
      addToast('success', `Saved tab number to ${configName}`)
    } else {
      addToast('error', `Failed to save tab number: ${result?.error || 'Unknown error'}`)
    }
  } catch (err) {
    log.error('[ConfigHandlers]', 'Failed to write config tab to SW file', { filePath, configName, error: err })
    addToast('error', 'Failed to save tab number to file')
  }
}, [addToast])
```

### Key Changes

1. Make both functions `async`
2. After updating the store, call `setProperties()` to write to the SW file's configuration
3. Show toast on success ("Saved to file") and on failure ("Failed to save to file")
4. If the write fails, the pending metadata is still saved and will sync on check-in

### Note on Tab Number

For tab number, we also need to update the `Number` property (combined base + tab). The TODO notes that we should use serialization settings for the separator, but for now a simple dash works.

## Testing

### Test 1: Config Description

1. Open a part with configurations in BluePLM
2. Check out the part
3. Edit the description on one of its configuration rows (e.g., T200X)
4. Click away from the input (blur) or press Enter
5. Right-click on a drawing that references that configuration
6. Click "Sync Metadata"
7. **Expected**: Drawing's description should update to the new value immediately

### Test 2: Config Tab Number

1. Open a part with configurations in BluePLM
2. Check out the part
3. Edit the tab number on one of its configuration rows
4. Click away from the input (blur) or press Enter
5. Check the SW file properties (or right-click drawing > Sync Metadata)
6. **Expected**: The Number property should show the updated base-tab combination

### Verify SW File Updated

After editing, you can verify the SW file was updated by:

- Opening the part in SolidWorks and checking custom properties
- Or running "Sync Metadata" on a drawing referencing that config