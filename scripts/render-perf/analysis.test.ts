import { describe, expect, it } from 'vitest'

import { compare, markdownTable, METRICS, type RenderPerfResult } from './compare'
import {
  cpuTimeByFunction,
  frameStats,
  heapStats,
  median,
  percentile,
  retainedByStack,
  type SamplingHeapNode,
} from './stats'
import { probeRetainers } from './heapRetainers'
import { decodeSegment, SourceMapLookup } from './sourceMap'
import { categoryOf, mainThreadBreakdown, TraceStreamParser, type TraceEvent } from './traceMetrics'

const MAIN = { pid: 7, tid: 1 }
const meta = (pid: number, tid: number, name: string): TraceEvent => ({
  name: 'thread_name',
  ph: 'M',
  ts: 0,
  pid,
  tid,
  args: { name },
})
const x = (name: string, tsMs: number, durMs: number, at = MAIN): TraceEvent => ({
  name,
  ph: 'X',
  ts: tsMs * 1000,
  dur: durMs * 1000,
  ...at,
})

describe('mainThreadBreakdown', () => {
  it('attributes self time by category and counts long tasks', () => {
    const events = [
      meta(MAIN.pid, MAIN.tid, 'CrRendererMain'),
      meta(9, 2, 'CrRendererMain'),
      // A 120 ms task: 80 ms of script (10 ms of it a nested GC), 30 ms layout, 5 ms paint.
      x('RunTask', 0, 120),
      x('FunctionCall', 0, 80),
      x('MinorGC', 10, 10),
      x('Layout', 80, 30),
      x('Paint', 110, 5),
      // A short task: not long.
      x('RunTask', 200, 20),
      x('UpdateLayoutTree', 200, 20),
      // Another renderer with fewer events is ignored.
      x('FunctionCall', 0, 500, { pid: 9, tid: 2 }),
    ]
    const b = mainThreadBreakdown(events)!
    expect(b.scriptingMs).toBe(70)
    expect(b.gcMs).toBe(10)
    expect(b.layoutMs).toBe(30)
    expect(b.styleMs).toBe(20)
    expect(b.paintMs).toBe(5)
    expect(b.otherMs).toBe(5) // the task's own overhead
    expect(b.longTasks).toBe(1)
    expect(b.totalBlockingMs).toBe(70)
    expect(b.spanMs).toBe(220)
  })

  it('clips a child that overruns its parent and returns null without a renderer', () => {
    const events = [meta(MAIN.pid, MAIN.tid, 'CrRendererMain'), x('RunTask', 0, 10), x('FunctionCall', 5, 20)]
    const b = mainThreadBreakdown(events)!
    expect(b.scriptingMs).toBe(5)
    expect(b.otherMs).toBe(5)
    expect(mainThreadBreakdown([x('RunTask', 0, 10)])).toBeNull()
  })

  it('categorizes by event name', () => {
    expect(categoryOf('EvaluateScript')).toBe('scripting')
    expect(categoryOf('V8.GCScavenger')).toBe('gc')
    expect(categoryOf('PrePaint')).toBe('paint')
    expect(categoryOf('ParseHTML')).toBe('other')
  })
})

describe('stats', () => {
  it('median and percentile', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(Number.isNaN(median([]))).toBe(true)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5)
  })

  it('frameStats counts dropped and janky frames against the vsync interval', () => {
    const v = 1000 / 60
    // 10 clean frames, one 50 ms gap (two dropped), then a 30 ms frame (janky, one dropped).
    const ts = [0]
    for (let i = 0; i < 10; i++) ts.push(ts[ts.length - 1] + v)
    ts.push(ts[ts.length - 1] + 50)
    ts.push(ts[ts.length - 1] + 30)
    const s = frameStats(ts, v)
    expect(s.frames).toBe(12)
    expect(s.droppedFrames).toBe(3)
    expect(s.jankyFrames).toBe(2)
    expect(s.maxFrameMs).toBe(50)
    expect(s.p50FrameMs).toBeCloseTo(16.7, 1)
  })

  it('heapStats reports growth and a fitted slope', () => {
    const h = heapStats([
      { minute: 0, usedMB: 100 },
      { minute: 10, usedMB: 110 },
      { minute: 20, usedMB: 120 },
    ])
    expect(h.growthMB).toBe(20)
    expect(h.slopeMBPer10Min).toBe(10)
    expect(h.peakMB).toBe(120)
  })
})

const result = (runId: string, date: string, metrics: Record<string, number>, ref = 'refs/heads/main'): RenderPerfResult => ({
  schema: 1,
  sha: runId,
  ref,
  runId,
  date,
  fileCount: 30_000,
  reps: 3,
  sessionMinutes: 30,
  metrics,
})

describe('compare', () => {
  const history = [1, 2, 3, 4, 5].map((d) =>
    result(`r${d}`, `2026-10-0${d}T00:00:00Z`, { 'coldStart.launchToLoadedMs': 4000 + d * 10, 'scroll.p95FrameMs': 20 }),
  )

  it('flags only large changes over the floor, against the median of recent main runs', () => {
    const c = compare(
      result('now', '2026-10-10T00:00:00Z', {
        'coldStart.launchToLoadedMs': 6000, // +48%, +1970 ms: flagged
        'scroll.p95FrameMs': 26, // +30% but only +6 ms (floor 8): not flagged
      }),
      [...history, result('pr', '2026-10-09T00:00:00Z', { 'coldStart.launchToLoadedMs': 1 }, 'refs/heads/feature')],
    )
    const row = (key: string) => c.rows.find((r) => r.spec.key === key)!
    expect(c.historyRuns).toBe(5)
    expect(row('coldStart.launchToLoadedMs').baseline).toBe(4030)
    expect(row('coldStart.launchToLoadedMs').status).toBe('regressed')
    expect(row('scroll.p95FrameMs').status).toBe('ok')
    expect(row('tree.settleMs').status).toBe('missing')
    expect(c.failed).toBe(true)
    expect(markdownTable(c, result('now', '', {}))).toContain('**REGRESSED**')
  })

  it('applies the heap ceilings without history, and passes a first run otherwise', () => {
    const first = compare(result('a', '2026-10-01', { 'session.heapGrowthMB': 10, 'coldStart.longTasks': 9 }), [])
    expect(first.failed).toBe(false)
    expect(first.rows.find((r) => r.spec.key === 'coldStart.longTasks')!.status).toBe('no-history')
    const leak = compare(result('b', '2026-10-01', { 'session.heapGrowthMB': 80 }), [])
    expect(leak.rows.find((r) => r.spec.key === 'session.heapGrowthMB')!.status).toBe('over-ceiling')
    expect(leak.failed).toBe(true)
  })

  it('reports improvements without failing', () => {
    const c = compare(result('now', '2026-10-10', { 'coldStart.launchToLoadedMs': 2000 }), history)
    expect(c.rows.find((r) => r.spec.key === 'coldStart.launchToLoadedMs')!.status).toBe('improved')
    expect(c.failed).toBe(false)
  })

  it('has unique metric keys', () => {
    expect(new Set(METRICS.map((m) => m.key)).size).toBe(METRICS.length)
  })
})

describe('TraceStreamParser', () => {
  it('parses a trace split at any point, keeping thread names and complete events', () => {
    const trace = JSON.stringify({
      traceEvents: [
        meta(MAIN.pid, MAIN.tid, 'CrRendererMain'),
        { ...x('RunTask', 0, 120), args: { data: { note: 'a } brace and a " quote \\ in a string' } } },
        { name: 'Instant', ph: 'I', ts: 5, pid: 7, tid: 1 },
        x('FunctionCall', 0, 80),
      ],
      metadata: { 'trace-config': { notAnEvent: true } },
    })
    for (const size of [1, 7, 64, trace.length]) {
      const parser = new TraceStreamParser()
      for (let i = 0; i < trace.length; i += size) parser.push(trace.slice(i, i + size))
      expect(parser.events.map((e) => e.name)).toEqual(['thread_name', 'RunTask', 'FunctionCall'])
      expect(mainThreadBreakdown(parser.events)!.scriptingMs).toBe(80)
    }
  })
})

describe('retainedByStack', () => {
  const node = (fn: string, selfSize: number, children: SamplingHeapNode[] = []): SamplingHeapNode => ({
    callFrame: { functionName: fn, url: `file:///app/assets/${fn}.js`, lineNumber: 9, columnNumber: 0 },
    selfSize,
    children,
  })
  it('sums live bytes by the innermost frames, largest first', () => {
    const head = node('(root)', 0, [
      node('onRealtime', 0, [node('push', 3 * 1024 * 1024), node('clone', 1024 * 1024)]),
      node('scroll', 0, [node('push', 1024 * 1024)]),
    ])
    const top = retainedByStack(head, { depth: 2 })
    expect(top[0]).toEqual({ stack: 'push push.js:10 < onRealtime onRealtime.js:10', MB: 3 })
    expect(top).toHaveLength(3)
  })
})

describe('cpuTimeByFunction', () => {
  const frame = (fn: string) => ({ functionName: fn, url: `file:///app/assets/${fn}.js`, lineNumber: 0, columnNumber: 0 })
  it('sums sampled time by function, self and total, largest first', () => {
    // root > render > (sort, render > sort): render recurses, so its total counts each sample once.
    const profile = {
      nodes: [
        { id: 1, callFrame: frame('(root)'), children: [2] },
        { id: 2, callFrame: frame('render'), children: [3, 4] },
        { id: 3, callFrame: frame('sort') },
        { id: 4, callFrame: frame('render'), children: [5] },
        { id: 5, callFrame: frame('sort') },
      ],
      samples: [3, 5, 2, 3],
      // Sample i lasts until sample i + 1; the last one has no end and counts nothing.
      timeDeltas: [0, 2000, 3000, 1000],
    }
    const { self, total } = cpuTimeByFunction(profile)
    expect(self).toEqual([
      ['sort sort.js:1', 5],
      ['render render.js:1', 1],
    ])
    expect(total).toEqual([
      ['render render.js:1', 6],
      ['sort sort.js:1', 5],
    ])
  })
})

describe('SourceMapLookup', () => {
  it('decodes VLQ segments, negative values included', () => {
    expect(decodeSegment('AACAA')).toEqual([0, 0, 1, 0, 0])
    expect(decodeSegment('D')).toEqual([-1])
    expect(decodeSegment('gB')).toEqual([16])
  })

  it('maps a built position to the source line and name', () => {
    const map = new SourceMapLookup({
      version: 3,
      sources: ['../src/a.ts'],
      names: ['foo'],
      mappings: 'AAAA;AACAA,IAAI',
    })
    expect(map.lookup(2, 0)).toEqual({ source: '../src/a.ts', line: 2, column: 0, name: 'foo' })
    expect(map.lookup(2, 9)).toEqual({ source: '../src/a.ts', line: 2, column: 4, name: null })
    expect(map.lookup(5, 0)).toBeNull()
  })
})

describe('probeRetainers', () => {
  // root -(holder)-> Cache -(rows)-> Array -[0]-> Row{__probe:'p3'}; Row{__probe:'p9'} only weakly.
  const NF = 5
  const strings = ['', 'root', 'Cache', 'Array', 'Row', 'holder', 'rows', '__probe', 'p3', 'p9', 'ref']
  const nodeTypes = ['synthetic', 'object', 'array', 'string']
  const edgeTypes = ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak']
  // type, name, id, self_size, edge_count
  const nodes = [
    0, 1, 1, 0, 2, // 0 root: holder, weak ref
    1, 2, 2, 0, 1, // 1 Cache: rows
    2, 3, 3, 0, 1, // 2 Array: [0]
    1, 4, 4, 0, 1, // 3 Row p3
    3, 8, 5, 0, 0, // 4 'p3'
    1, 4, 6, 0, 1, // 5 Row p9
    3, 9, 7, 0, 0, // 6 'p9'
  ]
  const P = edgeTypes.indexOf('property')
  const edges = [
    P, 5, 1 * NF, edgeTypes.indexOf('weak'), 10, 5 * NF, // root
    P, 6, 2 * NF, // Cache.rows
    edgeTypes.indexOf('element'), 0, 3 * NF, // Array[0]
    P, 7, 4 * NF, // Row.__probe = 'p3'
    P, 7, 6 * NF, // Row.__probe = 'p9'
  ]
  const snap = {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
        node_types: [nodeTypes] as [string[]],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [edgeTypes] as [string[]],
      },
    },
    nodes,
    edges,
    strings,
  }

  it('finds tagged objects and the shortest strong path to the oldest', () => {
    const report = probeRetainers(snap, '__probe', 1)
    expect(report.alive).toBe(2)
    expect(report.newestEvent).toBe(9)
    expect(report.oldest).toEqual([
      { event: 3, path: ['holder -> object:Cache', 'rows -> array:Array', '[0] -> object:Row'] },
    ])
  })
})
