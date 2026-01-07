import { StateCreator } from 'zustand'
import type { PDMStoreState, ECOsSlice } from '../types'

export const createECOsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  ECOsSlice
> = (set, get) => ({
  // Initial state
  ecos: [],
  ecosLoading: false,
  ecosLoaded: false,
  
  // ═══════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════
  
  setECOs: (ecos) => set({ ecos, ecosLoaded: true }),
  setECOsLoading: (loading) => set({ ecosLoading: loading }),
  
  addECO: (eco) => set((state) => ({ 
    ecos: [...state.ecos, eco] 
  })),
  
  updateECO: (id, updates) => set((state) => ({
    ecos: state.ecos.map(e => e.id === id ? { ...e, ...updates } : e)
  })),
  
  removeECO: (id) => set((state) => ({
    ecos: state.ecos.filter(e => e.id !== id)
  })),
  
  clearECOs: () => set({ 
    ecos: [], 
    ecosLoaded: false,
    ecosLoading: false
  }),
  
  // Getter for active ECOs (open or in_progress)
  getActiveECOs: () => {
    const { ecos } = get()
    return ecos.filter(e => e.status === 'open' || e.status === 'in_progress')
  }
})
