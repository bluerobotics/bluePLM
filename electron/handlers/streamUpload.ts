import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { pipeline } from 'node:stream/promises'

export interface StreamUploadOptions {
  filePath: string
  uploadUrl: string
  contentType?: string
  onProgress?: (progress: { loaded: number; total: number; speed: number }) => void
}

export interface StreamUploadResult {
  success: boolean
  statusCode?: number
  error?: string
}

/**
 * Streams a vault file to a pre-authorized upload URL. The renderer never receives
 * the file bytes, avoiding base64 expansion and Electron IPC payload limits.
 */
export async function streamFileToUploadUrl({
  filePath,
  uploadUrl,
  contentType = 'application/octet-stream',
  onProgress,
}: StreamUploadOptions): Promise<StreamUploadResult> {
  let target: URL
  try {
    target = new URL(uploadUrl)
  } catch {
    return { success: false, error: 'Upload URL is invalid.' }
  }

  if ((target.protocol !== 'https:' && target.protocol !== 'http:') || target.username || target.password) {
    return { success: false, error: 'Upload URL must be an HTTP(S) URL without credentials.' }
  }

  let stats: fs.Stats
  try {
    stats = await fs.promises.stat(filePath)
  } catch (error) {
    return { success: false, error: `Cannot read upload source: ${String(error)}` }
  }
  if (!stats.isFile()) return { success: false, error: 'Upload source is not a file.' }

  const total = stats.size
  const transport = target.protocol === 'https:' ? https : http

  return new Promise<StreamUploadResult>((resolve) => {
    let settled = false
    let loaded = 0
    let lastProgressAt = Date.now()
    let lastProgressBytes = 0
    const settle = (result: StreamUploadResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const request = transport.request(
      target,
      {
        method: 'PUT',
        headers: {
          'content-length': String(total),
          'content-type': contentType,
          'cache-control': 'max-age=3600',
          'x-upsert': 'false',
        },
        timeout: 10 * 60 * 1000,
      },
      (response) => {
        let detail = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          // Error payloads are useful, but never let a bad peer consume arbitrary memory.
          if (detail.length < 16 * 1024) detail += chunk
        })
        response.on('end', () => {
          const statusCode = response.statusCode ?? 0
          if (statusCode >= 200 && statusCode < 300) {
            onProgress?.({ loaded: total, total, speed: 0 })
            settle({ success: true, statusCode })
            return
          }
          settle({
            success: false,
            statusCode,
            error: `Upload failed with HTTP ${statusCode}${detail ? `: ${detail}` : ''}`,
          })
        })
      },
    )

    request.on('error', (error) => settle({ success: false, error: `Upload request failed: ${error.message}` }))
    request.on('timeout', () => request.destroy(new Error('Upload timed out.')))

    const source = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 })
    source.on('data', (chunk: string | Buffer) => {
      loaded += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      const now = Date.now()
      if (now - lastProgressAt >= 100) {
        const elapsedSeconds = (now - lastProgressAt) / 1000
        onProgress?.({
          loaded,
          total,
          speed: elapsedSeconds > 0 ? (loaded - lastProgressBytes) / elapsedSeconds : 0,
        })
        lastProgressAt = now
        lastProgressBytes = loaded
      }
    })

    void pipeline(source, request).catch((error: Error) => {
      settle({ success: false, error: `Upload stream failed: ${error.message}` })
    })
  })
}
