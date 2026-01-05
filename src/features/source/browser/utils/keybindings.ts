/**
 * Interface for a keybinding definition
 */
export interface Keybinding {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

/**
 * Check if a keyboard event matches a keybinding
 * 
 * @param e - The keyboard event to check
 * @param binding - The keybinding to match against
 * @returns true if the event matches the keybinding
 */
export function matchesKeybinding(
  e: KeyboardEvent,
  binding: Keybinding | undefined
): boolean {
  if (!binding) return false
  
  // Check modifiers - treat Ctrl and Meta as interchangeable (for Mac compatibility)
  const ctrlOrMeta = e.ctrlKey || e.metaKey
  const bindingCtrlOrMeta = binding.ctrlKey || binding.metaKey
  
  if (bindingCtrlOrMeta && !ctrlOrMeta) return false
  if (!bindingCtrlOrMeta && ctrlOrMeta) return false
  if (!!binding.altKey !== e.altKey) return false
  if (!!binding.shiftKey !== e.shiftKey) return false
  
  // Check key (case-insensitive for letters)
  return e.key.toLowerCase() === binding.key.toLowerCase()
}
