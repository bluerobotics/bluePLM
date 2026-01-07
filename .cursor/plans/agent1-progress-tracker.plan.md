# Agent 1: Fix Progress Toast Updates

## Problem

When uploading 920 files via the vault inline upload button, the progress toast shows "0 out of 920" and never updates, even though uploads are succeeding (visible in terminal logs).

## Root Cause

The `ProgressTracker` class in `src/lib/commands/executor.ts` throttles updates with this logic (lines 340-343):

```typescript
if (timeSinceLastUpdate < 100 && percentChange < 5 && !isComplete) {
  return  // Skip update
}
```

With 920 parallel uploads via `Promise.all`:
- 5% of 920 = 46 files needed for `percentChange` to trigger
- `Math.round(1/920 * 100) = 0%`, so first 46 completions show 0% change
- If files complete within 100ms of each other, updates are skipped
- Initial toast has no label set, showing raw "0/920"

## Solution

**IMPORTANT**: Keep the `Promise.all` parallel upload strategy unchanged - it's correct for speed. Only fix the progress display.

### File to Modify

`src/lib/commands/executor.ts` - the `ProgressTracker` class (lines 294-378)

### Changes Required

#### 1. Set initial label in constructor

After `ctx.addProgressToast(toastId, message, total)`, immediately set the label:

```typescript
constructor(
  ctx: CommandContext,
  commandId: CommandId,
  toastId: string,
  message: string,
  total: number
) {
  this.ctx = ctx
  this.toastId = toastId
  this.operationId = `${commandId}-${toastId}`
  this.total = total
  this.startTime = Date.now()
  
  ctx.addProgressToast(toastId, message, total)
  
  // NEW: Set initial label so UI shows "0/X" immediately
  ctx.updateProgressToast(toastId, 0, 0, undefined, `0/${total}`)
  
  // Register this operation for tracking/cancellation
  registerActiveOperation(this.operationId, commandId, toastId, message)
}
```

#### 2. Simplify throttling to time-based only

Remove the `percentChange < 5` condition which breaks with large file counts:

```typescript
update(): void {
  this.completed++
  
  // Calculate percent
  const percent = Math.round((this.completed / this.total) * 100)
  const now = Date.now()
  const timeSinceLastUpdate = now - this.lastUpdateTime
  const isComplete = this.completed >= this.total
  
  // Throttle updates: only update if enough time passed or complete
  // CHANGED: Removed percentChange check - time-based throttling is sufficient
  // 100ms = 10 updates/second max, which is smooth enough for UI
  if (timeSinceLastUpdate < 100 && !isComplete) {
    return
  }
  
  this.lastUpdateTime = now
  this.lastUpdatePercent = percent
  
  // Build label - simple file count format
  const label = `${this.completed}/${this.total}`
  
  this.ctx.updateProgressToast(
    this.toastId,
    this.completed,
    percent,
    undefined,
    label
  )
}
```

#### 3. Remove unused lastUpdatePercent tracking (cleanup)

Since we no longer use `percentChange`, we can simplify by removing `lastUpdatePercent`:

```typescript
private lastUpdatePercent: number = 0  // Can be removed if not used elsewhere
```

Actually, keep it for now in case it's useful for future features - just don't use it in the throttle condition.

## Testing

1. Upload 100+ files from a folder - verify toast updates from 0 to 100 smoothly
2. Upload single file - verify no regression
3. Cancel mid-upload - verify toast clears correctly
4. Check that uploads still complete at the same speed as before

## Success Criteria

- Progress toast shows updates approximately every 100ms during large uploads
- Initial state shows "0/920" with visible label
- Upload speed is unchanged (parallel Promise.all preserved)
