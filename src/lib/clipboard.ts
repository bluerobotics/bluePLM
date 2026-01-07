/**
 * Clipboard utility for reliable clipboard operations in Electron
 * 
 * Uses Electron's native clipboard API via IPC which is more reliable
 * than navigator.clipboard in Electron environments (avoids permission errors).
 */

/**
 * Copy text to clipboard using the most reliable method available
 * @param text The text to copy to clipboard
 * @returns Promise that resolves to success status
 */
export async function copyToClipboard(text: string): Promise<{ success: boolean; error?: string }> {
  // Try Electron's clipboard API first (most reliable)
  if (window.electronAPI?.copyToClipboard) {
    try {
      const result = await window.electronAPI.copyToClipboard(text)
      if (result.success) {
        return { success: true }
      }
      // Fall through to navigator.clipboard if Electron API fails
    } catch {
      // Electron clipboard unavailable, try navigator.clipboard
    }
  }
  
  // Fallback to navigator.clipboard (for browser dev or if Electron API unavailable)
  try {
    await navigator.clipboard.writeText(text)
    return { success: true }
  } catch (err) {
    // Final fallback: use execCommand (deprecated but works in some cases)
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      if (successful) {
        return { success: true }
      }
    } catch {
      // execCommand fallback failed
    }
    
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Failed to copy to clipboard'
    }
  }
}

/**
 * Read text from clipboard using the most reliable method available
 * @returns Promise that resolves to the clipboard text or error
 */
export async function readFromClipboard(): Promise<{ success: boolean; text?: string; error?: string }> {
  // Try Electron's clipboard API first
  if (window.electronAPI?.readFromClipboard) {
    try {
      const result = await window.electronAPI.readFromClipboard()
      if (result.success && result.text !== undefined) {
        return { success: true, text: result.text }
      }
    } catch {
      // Electron clipboard read unavailable, try navigator.clipboard
    }
  }
  
  // Fallback to navigator.clipboard
  try {
    const text = await navigator.clipboard.readText()
    return { success: true, text }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to read from clipboard'
    }
  }
}

