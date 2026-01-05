import { useMemo } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { getSelectionCategories, type SelectionCategories } from '@/lib/fileOperations'

interface UseSelectionCategoriesOptions {
  files: LocalFile[]
  selectedFiles: string[]
  userId?: string
}

export function useSelectionCategories(options: UseSelectionCategoriesOptions): SelectionCategories {
  const { files, selectedFiles, userId } = options

  return useMemo(
    () => getSelectionCategories(files, selectedFiles, userId),
    [files, selectedFiles, userId]
  )
}
