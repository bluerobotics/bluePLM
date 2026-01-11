# Performance Deep Fix - Phase 2 (Agent 4 Expanded)

## Status

| Agent | Status | Files |

|-------|--------|-------|

| Agent 1 | ✅ Complete | `VirtualizedTreeRow.tsx` |

| Agent 2 | ✅ Complete | `TreeItemActions.tsx` |

| Agent 3 | ✅ Complete | `TreeHoverContext.tsx` |

| Agent 5 | ✅ Complete | `src/index.css` |

| **Agent 4** | 🔄 **Pending** | See expanded scope below |

---

## Agent 4: Expanded Scope

Agent 4 must now wire up ALL the props from FileTree.tsx through the component tree. This includes fixing files that weren't in the original plan.

### Files Owned by Agent 4

| File | Changes Required |

|------|------------------|

| `FileTree.tsx` | Pass all new props to VirtualizedTreeRow |

| `VirtualizedTreeRow.tsx` | Add action button props to interface, pass to children |

| `FolderTreeItem.tsx` | Pass new props to FileActionButtons/FolderActionButtons |

| `PinnedFoldersSection.tsx` | Pass new props to FileActionButtons/FolderActionButtons |

### Props Chain

```
FileTree.tsx
  │
  ├─► VirtualizedTreeRow
  │     ├─► FileActionButtons (needs: user, isOfflineMode, stageCheckin, unstageCheckin, getStagedCheckin, addToast)
  │     └─► FolderActionButtons (needs: isOfflineMode, allFiles)
  │
  ├─► FolderTreeItem
  │     └─► FileActionButtons / FolderActionButtons (same props)
  │
  └─► PinnedFoldersSection
        └─► FileActionButtons / FolderActionButtons (same props)
```

### New Props Required

**For FileActionButtons:**

- `user: User | null`
- `isOfflineMode: boolean`
- `stageCheckin: (data: StagedCheckin) => void`
- `unstageCheckin: (path: string) => void`
- `getStagedCheckin: (path: string) => StagedCheckin | undefined`
- `addToast: (type: ToastType, message: string) => void`

**For FolderActionButtons:**

- `isOfflineMode: boolean`
- `allFiles: LocalFile[]`

**For VirtualizedTreeRow (from Agent 1):**

- `currentFolder: string`
- `lowercaseExtensions: boolean`
- `toggleFolder: (path: string) => void`

---

## Validation

After Agent 4 completes:

1. `npm run typecheck` - **MUST pass with 0 errors**
2. `npm run build` - must succeed
3. Manual testing:

   - Click folders - should be instant
   - Hover action buttons - should be instant
   - Click inline actions - spinners should appear immediately

---

## Report Required

Agent 4 must create: `.cursor/reports/AGENT_4_PARENT_WIRING_REPORT.md`