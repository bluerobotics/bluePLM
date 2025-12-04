/**
 * eDrawings Preview Native Addon Wrapper
 * 
 * Provides a safe wrapper that handles cases where the native addon
 * isn't built or isn't available (non-Windows platforms).
 */

let nativeModule = null;
let loadError = null;

// Try to load the native module
try {
  nativeModule = require('./build/Release/edrawings_preview.node');
} catch (err) {
  loadError = err.message;
  console.warn('[eDrawings] Native module not available:', err.message);
}

/**
 * Check if the native module is available
 */
function isAvailable() {
  return nativeModule !== null;
}

/**
 * Get the load error if module failed to load
 */
function getLoadError() {
  return loadError;
}

/**
 * Check if eDrawings is installed on the system
 * @returns {{ installed: boolean, path: string | null }}
 */
function checkEDrawingsInstalled() {
  if (!nativeModule) {
    return { installed: false, path: null, error: 'Native module not loaded' };
  }
  try {
    return nativeModule.checkEDrawingsInstalled();
  } catch (err) {
    return { installed: false, path: null, error: err.message };
  }
}

/**
 * Open a file in external eDrawings application
 * @param {string} filePath - Path to the file to open
 * @returns {boolean} - True if launch succeeded
 */
function openInEDrawings(filePath) {
  if (!nativeModule) {
    // Fallback: try shell open
    const { shell } = require('electron');
    shell.openPath(filePath);
    return true;
  }
  try {
    return nativeModule.openInEDrawings(filePath);
  } catch (err) {
    console.error('[eDrawings] Failed to open file:', err);
    return false;
  }
}

/**
 * Create an eDrawings preview control
 * @returns {EDrawingsPreview | null}
 */
function createPreview() {
  if (!nativeModule) {
    return null;
  }
  try {
    return new nativeModule.EDrawingsPreview();
  } catch (err) {
    console.error('[eDrawings] Failed to create preview:', err);
    return null;
  }
}

module.exports = {
  isAvailable,
  getLoadError,
  checkEDrawingsInstalled,
  openInEDrawings,
  createPreview,
  // Export class directly if available
  EDrawingsPreview: nativeModule?.EDrawingsPreview || null
};

