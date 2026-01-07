import { useState, useEffect } from 'react'
import { log } from '@/lib/logger'
import { SW_THUMBNAIL_EXTENSIONS, MAX_THUMBNAIL_SIZE } from '../../../constants'

export interface UseThumbnailParams {
  file: {
    path?: string
    extension: string
    isDirectory: boolean
  }
  iconSize: number
  isProcessing: boolean
}

export interface ThumbnailState {
  thumbnail: string | null
  thumbnailError: boolean
  loadingThumbnail: boolean
  setThumbnailError: (error: boolean) => void
}

/**
 * Hook to load SolidWorks thumbnails for supported file types
 */
export function useThumbnail({ file, iconSize, isProcessing }: UseThumbnailParams): ThumbnailState {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [thumbnailError, setThumbnailError] = useState(false)
  const [loadingThumbnail, setLoadingThumbnail] = useState(false)

  useEffect(() => {
    if (isProcessing) {
      setThumbnail(null)
      setLoadingThumbnail(false)
      return
    }

    const loadThumbnail = async () => {
      const ext = file.extension.toLowerCase()

      if (!file.isDirectory && SW_THUMBNAIL_EXTENSIONS.includes(ext) && file.path && iconSize >= 64) {
        setLoadingThumbnail(true)
        setThumbnailError(false)
        try {
          const result = await window.electronAPI?.extractSolidWorksThumbnail(file.path)
          if (result?.success && result.data && result.data.startsWith('data:image/')) {
            if (result.data.length > 100 && result.data.length < MAX_THUMBNAIL_SIZE) {
              setThumbnail(result.data)
            } else {
              setThumbnail(null)
            }
          } else {
            setThumbnail(null)
          }
        } catch (err) {
          log.error('[Thumbnail]', 'Failed to extract thumbnail', { error: err })
          setThumbnail(null)
        } finally {
          setLoadingThumbnail(false)
        }
      } else {
        setThumbnail(null)
        setThumbnailError(false)
      }
    }

    loadThumbnail()
  }, [file.path, file.extension, file.isDirectory, iconSize, isProcessing])

  return {
    thumbnail,
    thumbnailError,
    loadingThumbnail,
    setThumbnailError
  }
}
