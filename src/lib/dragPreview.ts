/**
 * The drag image for files and folders dragged out of the file list, the explorer tree and the
 * shared drag hook: a folder or file icon and a label ("3 items" or the name).
 *
 * Built with DOM calls rather than an HTML string, so it works under BluePLM Web's Trusted Types
 * policy (no string may reach innerHTML) and looks the same on the desktop.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgIcon(isDirectory: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  for (const [name, value] of Object.entries({
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
  })) {
    svg.setAttribute(name, value)
  }
  const path = document.createElementNS(SVG_NS, 'path')
  if (isDirectory) {
    path.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z')
    svg.appendChild(path)
  } else {
    path.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z')
    const polyline = document.createElementNS(SVG_NS, 'polyline')
    polyline.setAttribute('points', '14 2 14 8 20 8')
    svg.append(path, polyline)
  }
  return svg
}

/** Set the drag image for a drag of `count` items whose first item is `name`. */
export function setFileDragImage(
  dataTransfer: DataTransfer,
  options: { isDirectory: boolean; name: string; count: number },
): void {
  const dragPreview = document.createElement('div')
  dragPreview.style.cssText =
    'position:absolute;left:-1000px;padding:8px 12px;background:#1e293b;border:1px solid #3b82f6;border-radius:6px;color:white;font-size:13px;display:flex;align-items:center;gap:6px;'
  dragPreview.appendChild(svgIcon(options.isDirectory))
  dragPreview.appendChild(
    document.createTextNode(options.count > 1 ? `${options.count} items` : options.name),
  )
  document.body.appendChild(dragPreview)
  dataTransfer.setDragImage(dragPreview, 20, 20)
  setTimeout(() => dragPreview.remove(), 0)
}
