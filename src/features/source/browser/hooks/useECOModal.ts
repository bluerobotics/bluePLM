import { useState } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import type { ECO } from '@/stores/types'
import { usePDMStore } from '@/stores/pdmStore'

export type { ECO }

export interface UseECOModalReturn {
  // Modal visibility
  showECOModal: boolean
  setShowECOModal: (show: boolean) => void
  
  // File being added to ECO
  ecoFile: LocalFile | null
  setEcoFile: (file: LocalFile | null) => void
  
  // ECO list (from store)
  activeECOs: ECO[]
  loadingECOs: boolean
  
  // Form state
  selectedECO: string | null
  setSelectedECO: (eco: string | null) => void
  ecoNotes: string
  setEcoNotes: (notes: string) => void
  isAddingToECO: boolean
  setIsAddingToECO: (adding: boolean) => void
}

/**
 * Hook to manage ECO (Engineering Change Order) modal state
 * 
 * ECO list comes from the ecosSlice in the Zustand store.
 * Only UI state (modal visibility, form state) is local.
 */
export function useECOModal(): UseECOModalReturn {
  // ECO data from store
  const { getActiveECOs, ecosLoading } = usePDMStore()
  const activeECOs = getActiveECOs()
  
  // Local UI state
  const [showECOModal, setShowECOModal] = useState(false)
  const [ecoFile, setEcoFile] = useState<LocalFile | null>(null)
  const [selectedECO, setSelectedECO] = useState<string | null>(null)
  const [ecoNotes, setEcoNotes] = useState('')
  const [isAddingToECO, setIsAddingToECO] = useState(false)

  return {
    showECOModal,
    setShowECOModal,
    ecoFile,
    setEcoFile,
    activeECOs,
    loadingECOs: ecosLoading,
    selectedECO,
    setSelectedECO,
    ecoNotes,
    setEcoNotes,
    isAddingToECO,
    setIsAddingToECO
  }
}
