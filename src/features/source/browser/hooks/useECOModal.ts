import { useState } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface ECO {
  id: string
  eco_number: string
  title: string
}

export interface UseECOModalReturn {
  // Modal visibility
  showECOModal: boolean
  setShowECOModal: (show: boolean) => void
  
  // File being added to ECO
  ecoFile: LocalFile | null
  setEcoFile: (file: LocalFile | null) => void
  
  // ECO list
  activeECOs: ECO[]
  setActiveECOs: (ecos: ECO[]) => void
  loadingECOs: boolean
  setLoadingECOs: (loading: boolean) => void
  
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
 */
export function useECOModal(): UseECOModalReturn {
  const [showECOModal, setShowECOModal] = useState(false)
  const [ecoFile, setEcoFile] = useState<LocalFile | null>(null)
  const [activeECOs, setActiveECOs] = useState<ECO[]>([])
  const [selectedECO, setSelectedECO] = useState<string | null>(null)
  const [ecoNotes, setEcoNotes] = useState('')
  const [loadingECOs, setLoadingECOs] = useState(false)
  const [isAddingToECO, setIsAddingToECO] = useState(false)

  return {
    showECOModal,
    setShowECOModal,
    ecoFile,
    setEcoFile,
    activeECOs,
    setActiveECOs,
    loadingECOs,
    setLoadingECOs,
    selectedECO,
    setSelectedECO,
    ecoNotes,
    setEcoNotes,
    isAddingToECO,
    setIsAddingToECO
  }
}
