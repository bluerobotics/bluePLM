interface ExternalOpenResult {
  success: boolean
}

interface OpenCadFileInEDrawingsDependencies {
  openFile?: (filePath: string) => Promise<ExternalOpenResult>
  onFailure: (failure: unknown) => void
}

export async function openCadFileInEDrawings(
  filePath: string,
  { openFile, onFailure }: OpenCadFileInEDrawingsDependencies,
): Promise<boolean> {
  try {
    const result = await openFile?.(filePath)
    if (!result?.success) {
      onFailure(result)
      return false
    }
    return true
  } catch (error) {
    onFailure(error)
    return false
  }
}
