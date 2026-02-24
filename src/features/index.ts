/**
 * Feature Modules Index
 * 
 * Import directly from submodules to avoid naming conflicts
 * (e.g., ContextMenuState, OrgUser, EmptyState are defined in multiple modules).
 * 
 * Example: import { FileTree } from '@/features/source'
 */

// These modules have unique exports, safe to re-export
export * from './dev-tools'

// Note: Other features have overlapping exports and should be imported directly:
// - import { ... } from '@/features/source'
// - import { ... } from '@/features/source/workflows'
// - import { ... } from '@/features/settings'
// - import { ... } from '@/features/search'
// - import { ... } from '@/features/change-control'
// - import { ... } from '@/features/items'
// - import { ... } from '@/features/supply-chain'
// - import { ... } from '@/features/integrations'

// Note: seasonal-effects moved to components/effects/
