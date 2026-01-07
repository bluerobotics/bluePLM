import { StateCreator } from 'zustand'
import type { PDMStoreState, SuppliersSlice } from '../types'

export const createSuppliersSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  SuppliersSlice
> = (set) => ({
  // State
  suppliers: [],
  suppliersLoading: false,
  suppliersLoaded: false,
  
  // ═══════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════
  
  setSuppliers: (suppliers) => set({ suppliers, suppliersLoaded: true }),
  setSuppliersLoading: (loading) => set({ suppliersLoading: loading }),
  
  addSupplier: (supplier) => set((state) => ({ 
    suppliers: [...state.suppliers, supplier] 
  })),
  
  updateSupplier: (id, updates) => set((state) => ({
    suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...updates } : s)
  })),
  
  removeSupplier: (id) => set((state) => ({
    suppliers: state.suppliers.filter(s => s.id !== id)
  })),
  
  clearSuppliers: () => set({ 
    suppliers: [], 
    suppliersLoaded: false 
  }),
})
