/** Marks the settings modal's own overlay and panel, so the layer check skips them. */
export const SETTINGS_MODAL_LAYER_ATTR = 'data-settings-modal-layer'

/**
 * Elements that sit over the settings modal when open: dialogs (marked or ARIA-modal) and the
 * full-screen click-catchers that dropdowns and ad-hoc modals put behind themselves.
 */
const OVERLAY_SELECTOR = [
  '[aria-modal="true"]',
  '[role="dialog"]',
  '[data-native-preview-overlay="modal"]',
  '.fixed.inset-0',
].join(', ')

/**
 * True when something other than the settings modal is layered over it: a confirmation dialog
 * opened from a settings page, or an open dropdown's click-catcher. Escape belongs to that layer
 * then, not to the settings modal. Hidden layers, layers that ignore the pointer (seasonal
 * effects) and the modal's ancestors do not count.
 */
export function hasLayerAboveSettings(doc: Document = document): boolean {
  for (const el of doc.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)) {
    if (el.hasAttribute(SETTINGS_MODAL_LAYER_ATTR)) continue
    if (el.querySelector(`[${SETTINGS_MODAL_LAYER_ATTR}]`)) continue
    const style = doc.defaultView?.getComputedStyle(el)
    if (style && (style.pointerEvents === 'none' || style.display === 'none')) continue
    if (style?.visibility === 'hidden') continue
    return true
  }
  return false
}
