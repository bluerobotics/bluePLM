/**
 * Who keeps a tagged object alive, from a V8 heap snapshot (`HeapProfiler.takeHeapSnapshot`).
 *
 * The perf control tags each realtime row it sends with `__probe: 'p<event>'`. After the long
 * session, a row from an early event that is still alive is held by something: the store only
 * keeps a file's latest row. This walks the snapshot from the GC roots (weak edges skipped) and
 * returns the shortest retainer path of a few of the oldest tagged objects, so the nightly names
 * the holder instead of only the allocation site.
 */

export interface HeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[]
      node_types: [string[], ...unknown[]]
      edge_fields: string[]
      edge_types: [string[], ...unknown[]]
    }
  }
  nodes: number[]
  edges: number[]
  strings: string[]
}

export interface ProbeReport {
  /** Tagged objects alive, and the highest event number seen among them. */
  alive: number
  newestEvent: number
  /** Shortest path from the roots to each of a few of the oldest tagged objects. */
  oldest: Array<{ event: number; path: string[] }>
}

export function probeRetainers(snap: HeapSnapshot, property = '__probe', samples = 4): ProbeReport {
  const m = snap.snapshot.meta
  const nf = m.node_fields.length
  const ef = m.edge_fields.length
  const nType = m.node_fields.indexOf('type')
  const nName = m.node_fields.indexOf('name')
  const nEdges = m.node_fields.indexOf('edge_count')
  const eType = m.edge_fields.indexOf('type')
  const eName = m.edge_fields.indexOf('name_or_index')
  const eTo = m.edge_fields.indexOf('to_node')
  const nodeTypes = m.node_types[0]
  const edgeTypes = m.edge_types[0]
  const { nodes, edges, strings } = snap
  const count = nodes.length / nf

  const firstEdge = new Int32Array(count + 1)
  for (let i = 0, e = 0; i < count; i++) {
    firstEdge[i] = e
    e += nodes[i * nf + nEdges] * ef
  }
  firstEdge[count] = edges.length

  // Tagged objects and their event numbers.
  const tagged: Array<{ node: number; event: number }> = []
  for (let i = 0; i < count; i++) {
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += ef) {
      if (edgeTypes[edges[e + eType]] !== 'property' || strings[edges[e + eName]] !== property) continue
      const value = strings[nodes[(edges[e + eTo] / nf) * nf + nName]]
      const event = /^p(\d+)$/.exec(value ?? '')
      if (event) tagged.push({ node: i, event: Number(event[1]) })
      break
    }
  }
  if (tagged.length === 0) return { alive: 0, newestEvent: -1, oldest: [] }
  tagged.sort((a, b) => a.event - b.event)

  const edgeLabel = (e: number) => {
    const type = edgeTypes[edges[e + eType]]
    const value = edges[e + eName]
    return type === 'element' || type === 'hidden' ? `[${value}]` : strings[value]
  }
  const nodeLabel = (i: number) =>
    `${nodeTypes[nodes[i * nf + nType]]}:${String(strings[nodes[i * nf + nName]]).slice(0, 60)}`

  // One breadth-first walk from the root gives the shortest path to every node.
  const prev = new Int32Array(count).fill(-1)
  const prevEdge = new Int32Array(count).fill(-1)
  const queue = new Int32Array(count)
  let head = 0
  let tail = 0
  queue[tail++] = 0
  prev[0] = 0
  while (head < tail) {
    const i = queue[head++]
    for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += ef) {
      if (edgeTypes[edges[e + eType]] === 'weak') continue
      const to = edges[e + eTo] / nf
      if (prev[to] !== -1) continue
      prev[to] = i
      prevEdge[to] = e
      queue[tail++] = to
    }
  }

  const pathTo = (target: number) => {
    const path: string[] = []
    for (let i = target; i > 0 && prev[i] !== -1 && path.length < 40; i = prev[i]) {
      path.push(`${edgeLabel(prevEdge[i])} -> ${nodeLabel(i)}`)
    }
    return path.reverse()
  }

  return {
    alive: tagged.length,
    newestEvent: tagged[tagged.length - 1].event,
    oldest: tagged.slice(0, samples).map(({ node, event }) => ({ event, path: pathTo(node) })),
  }
}
