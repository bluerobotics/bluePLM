import { useMemo } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import type { OperationType } from '@/stores/types'

export interface CheckoutUser {
  id: string
  name: string
  avatar_url?: string
  isMe: boolean
  isDifferentMachine?: boolean
  machineName?: string
}

export interface UseFileCardStatusParams {
  file: LocalFile
  allFiles: LocalFile[]
  userId: string | undefined
  userFullName: string | undefined
  userEmail: string | undefined
  userAvatarUrl: string | undefined
  currentMachineId: string | null
  processingPaths: Map<string, OperationType>
}

export interface FileCardStatus {
  isProcessing: boolean
  operationType: OperationType | null
  cloudFilesCount: number
  localOnlyFilesCount: number
  checkoutUsers: CheckoutUser[]
  diffClass: string
  folderIconColor: string
  folderCheckoutInfo: FolderCheckoutInfo | null
}

export interface FolderCheckoutInfo {
  checkedOutByMe: number
  checkedOutByOthers: number
  syncedNotCheckedOut: number
  localOnly: number
}

/**
 * Get the operation type for a file path if it's being processed
 */
function getProcessingOperation(processingPaths: Map<string, OperationType>, filePath: string): OperationType | null {
  const normalizedPath = filePath.replace(/\\/g, '/')

  if (processingPaths.has(filePath)) return processingPaths.get(filePath)!
  if (processingPaths.has(normalizedPath)) return processingPaths.get(normalizedPath)!

  for (const [processingPath, opType] of processingPaths) {
    const normalizedProcessingPath = processingPath.replace(/\\/g, '/')
    if (normalizedPath.startsWith(normalizedProcessingPath + '/')) return opType
  }
  return null
}

/**
 * Get diff class color for the card border/background
 */
function getDiffClass(diffStatus: string | undefined): string {
  if (diffStatus === 'modified') return 'ring-1 ring-yellow-500/50 bg-yellow-500/5'
  if (diffStatus === 'moved') return 'ring-1 ring-blue-500/50 bg-blue-500/5'
  if (diffStatus === 'deleted') return 'ring-1 ring-red-500/50 bg-red-500/5'
  if (diffStatus === 'outdated') return 'ring-1 ring-purple-500/50 bg-purple-500/5'
  if (diffStatus === 'cloud') return 'ring-1 ring-plm-fg-muted/30 bg-plm-fg-muted/5'
  if (diffStatus === 'cloud_new') return 'ring-1 ring-green-500/50 bg-green-500/10'
  return ''
}

/**
 * Get cloud files count for folders
 */
function getCloudFilesCount(file: LocalFile, allFiles: LocalFile[]): number {
  if (!file.isDirectory) return 0
  const folderPrefix = file.relativePath + '/'
  return allFiles.filter(f =>
    !f.isDirectory &&
    (f.diffStatus === 'cloud' || f.diffStatus === 'cloud_new') &&
    f.relativePath.startsWith(folderPrefix)
  ).length
}

/**
 * Get local-only files count for folders
 */
function getLocalOnlyFilesCount(file: LocalFile, allFiles: LocalFile[]): number {
  if (!file.isDirectory) return 0
  const folderPrefix = file.relativePath + '/'
  return allFiles.filter(f =>
    !f.isDirectory &&
    (!f.pdmData || f.diffStatus === 'added') &&
    f.diffStatus !== 'cloud' &&
    f.diffStatus !== 'cloud_new' &&
    f.diffStatus !== 'ignored' &&
    f.relativePath.startsWith(folderPrefix)
  ).length
}

/**
 * Get checkout users for file/folder
 */
function getCheckoutUsers(
  file: LocalFile,
  allFiles: LocalFile[],
  userId: string | undefined,
  userFullName: string | undefined,
  userEmail: string | undefined,
  userAvatarUrl: string | undefined,
  currentMachineId: string | null
): CheckoutUser[] {
  if (file.isDirectory) {
    const folderPrefix = file.relativePath + '/'
    const folderFiles = allFiles.filter(f =>
      !f.isDirectory &&
      f.pdmData?.checked_out_by &&
      f.relativePath.startsWith(folderPrefix)
    )

    const usersMap = new Map<string, CheckoutUser>()
    for (const f of folderFiles) {
      const checkoutUserId = f.pdmData!.checked_out_by!
      if (!usersMap.has(checkoutUserId)) {
        const isMe = checkoutUserId === userId
        const checkoutMachineId = f.pdmData?.checked_out_by_machine_id
        const checkoutMachineName = f.pdmData?.checked_out_by_machine_name
        const isDifferentMachine = isMe && checkoutMachineId && currentMachineId && checkoutMachineId !== currentMachineId

        if (isMe) {
          usersMap.set(checkoutUserId, {
            id: checkoutUserId,
            name: userFullName || userEmail || 'You',
            avatar_url: userAvatarUrl,
            isMe: true,
            isDifferentMachine: isDifferentMachine || false,
            machineName: checkoutMachineName ?? undefined
          })
        } else {
          const checkedOutUser = f.pdmData?.checked_out_user
          usersMap.set(checkoutUserId, {
            id: checkoutUserId,
            name: checkedOutUser?.full_name || checkedOutUser?.email?.split('@')[0] || 'Someone',
            avatar_url: checkedOutUser?.avatar_url ?? undefined,
            isMe: false
          })
        }
      }
    }
    return Array.from(usersMap.values())
  } else if (file.pdmData?.checked_out_by) {
    const isMe = file.pdmData.checked_out_by === userId
    const checkoutMachineId = file.pdmData.checked_out_by_machine_id
    const checkoutMachineName = file.pdmData.checked_out_by_machine_name
    const isDifferentMachine = isMe && checkoutMachineId && currentMachineId && checkoutMachineId !== currentMachineId

    if (isMe) {
      return [{
        id: file.pdmData.checked_out_by,
        name: userFullName || userEmail || 'You',
        avatar_url: userAvatarUrl,
        isMe: true,
        isDifferentMachine: isDifferentMachine || false,
        machineName: checkoutMachineName ?? undefined
      }]
    } else {
      const checkedOutUser = file.pdmData.checked_out_user
      return [{
        id: file.pdmData.checked_out_by,
        name: checkedOutUser?.full_name || checkedOutUser?.email?.split('@')[0] || 'Someone',
        avatar_url: checkedOutUser?.avatar_url ?? undefined,
        isMe: false
      }]
    }
  }
  return []
}

/**
 * Get folder icon color based on checkout status
 */
function getFolderIconColor(
  file: LocalFile,
  allFiles: LocalFile[],
  userId: string | undefined
): string {
  if (!file.isDirectory) return ''

  if (file.diffStatus === 'cloud') return 'text-plm-fg-muted opacity-50'

  const folderPath = file.relativePath.replace(/\\/g, '/')
  const folderPrefix = folderPath + '/'
  const serverOnlyStatuses = ['cloud', 'cloud_new', 'deleted']

  const folderFiles = allFiles.filter(f => {
    if (f.isDirectory) return false
    if (serverOnlyStatuses.includes(f.diffStatus || '')) return false
    const filePath = f.relativePath.replace(/\\/g, '/')
    return filePath.startsWith(folderPrefix)
  })

  const checkedOutByMe = folderFiles.some(f => f.pdmData?.checked_out_by === userId)
  const checkedOutByOthers = folderFiles.some(f => f.pdmData?.checked_out_by && f.pdmData.checked_out_by !== userId)

  if (checkedOutByOthers) return 'text-plm-error'
  if (checkedOutByMe) return 'text-orange-400'

  if (folderFiles.length === 0) return 'text-plm-fg-muted'
  const hasUnsyncedFiles = folderFiles.some(f => !f.pdmData || f.diffStatus === 'added')

  return hasUnsyncedFiles ? 'text-plm-fg-muted' : 'text-plm-success'
}

/**
 * Get folder checkout info
 */
function getFolderCheckoutInfo(
  file: LocalFile,
  allFiles: LocalFile[],
  userId: string | undefined
): FolderCheckoutInfo | null {
  if (!file.isDirectory) return null

  const folderPath = file.relativePath.replace(/\\/g, '/')
  const folderPrefix = folderPath + '/'
  const folderFiles = allFiles.filter(f => {
    if (f.isDirectory) return false
    const filePath = f.relativePath.replace(/\\/g, '/')
    return filePath.startsWith(folderPrefix)
  })

  const serverOnlyStatuses = ['cloud', 'cloud_new', 'deleted']
  const localFiles = folderFiles.filter(f => !serverOnlyStatuses.includes(f.diffStatus || ''))
  const checkedOutByMe = localFiles.filter(f => f.pdmData?.checked_out_by === userId).length
  const checkedOutByOthers = localFiles.filter(f => f.pdmData?.checked_out_by && f.pdmData.checked_out_by !== userId).length
  const syncedNotCheckedOut = localFiles.filter(f => f.pdmData && !f.pdmData.checked_out_by).length
  const localOnly = localFiles.filter(f => !f.pdmData).length

  return { checkedOutByMe, checkedOutByOthers, syncedNotCheckedOut, localOnly }
}

/**
 * Hook to compute all file card status information
 */
export function useFileCardStatus({
  file,
  allFiles,
  userId,
  userFullName,
  userEmail,
  userAvatarUrl,
  currentMachineId,
  processingPaths
}: UseFileCardStatusParams): FileCardStatus {
  return useMemo(() => {
    const operationType = getProcessingOperation(processingPaths, file.relativePath)
    const isProcessing = operationType !== null
    const diffClass = getDiffClass(file.diffStatus)
    const cloudFilesCount = getCloudFilesCount(file, allFiles)
    const localOnlyFilesCount = getLocalOnlyFilesCount(file, allFiles)
    const checkoutUsers = getCheckoutUsers(
      file,
      allFiles,
      userId,
      userFullName,
      userEmail,
      userAvatarUrl,
      currentMachineId
    )
    const folderIconColor = getFolderIconColor(file, allFiles, userId)
    const folderCheckoutInfo = getFolderCheckoutInfo(file, allFiles, userId)

    return {
      isProcessing,
      operationType,
      cloudFilesCount,
      localOnlyFilesCount,
      checkoutUsers,
      diffClass,
      folderIconColor,
      folderCheckoutInfo
    }
  }, [
    file,
    allFiles,
    userId,
    userFullName,
    userEmail,
    userAvatarUrl,
    currentMachineId,
    processingPaths
  ])
}
