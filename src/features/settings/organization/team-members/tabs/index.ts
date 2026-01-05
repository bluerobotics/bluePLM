/**
 * Tab components barrel export for team-members
 * 
 * These components render the content for each tab in the
 * Team Members Settings page.
 * 
 * They use hooks directly (usePDMStore, useTeams, etc.) instead of context.
 * Each tab accepts a searchQuery prop for filtering.
 * 
 * @module team-members/tabs
 */

export { UsersTab, type UsersTabProps } from './UsersTab'
export { TeamsTab, type TeamsTabProps } from './TeamsTab'
export { RolesTab, type RolesTabProps } from './RolesTab'
export { TitlesTab, type TitlesTabProps } from './TitlesTab'
