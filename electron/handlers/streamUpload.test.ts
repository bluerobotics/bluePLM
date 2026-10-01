import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { streamFileToUploadUrl } from './streamUpload'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('streamFileToUploadUrl', () => {
  it('streams bytes to a signed-upload-compatible endpoint without base64 conversion', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'blueplm-stream-upload-'))
    temporaryPaths.push(directory)
    const sourcePath = path.join(directory, 'large-enough.bin')
    const content = Buffer.alloc(8 * 1024 * 1024, 0x5a)
    await writeFile(sourcePath, content)

    let receivedBytes = 0
    let contentLength = ''
    let contentType = ''
    const server = createServer((request, response) => {
      contentLength = String(request.headers['content-length'] ?? '')
      contentType = String(request.headers['content-type'] ?? '')
      request.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length
      })
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{"Key":"vault/object"}')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.')

    try {
      const result = await streamFileToUploadUrl({
        filePath: sourcePath,
        uploadUrl: `http://127.0.0.1:${address.port}/storage/v1/object/upload/sign/vault/object?token=test`,
      })

      expect(result).toEqual({ success: true, statusCode: 200 })
      expect(receivedBytes).toBe(content.length)
      expect(contentLength).toBe(String(content.length))
      expect(contentType).toBe('application/octet-stream')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
