import { useState, useEffect } from 'react'
import { thumbnailCache } from '@/lib/thumbnailCache'
import { SW_THUMBNAIL_EXTENSIONS } from '../../../constants'

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
          // Use global thumbnail cache to avoid repeated IPC calls
          const data = await thumbnailCache.get(file.path)
          setThumbnail(data)
        } catch {
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
