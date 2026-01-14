import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'
import type {
  SolidWorksLicense,
  SolidWorksLicenseInsert,
  SolidWorksLicenseUpdate,
  LicenseWithAssignment,
  OrgUser,
  LicenseStatus,
  PendingAssignment
} from './types'

// Supabase v2 type inference incomplete for SolidWorks settings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// Mask serial number for logging (show only last 4 chars)
function maskSerialForLog(serial: string): string {
  if (serial.length <= 4) return serial
  return '****-' + serial.slice(-4)
}

export function useLicenseManager() {
  const { organization, user, addToast } = usePDMStore()
  
  const [licenses, setLicenses] = useState<LicenseWithAssignment[]>([])
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Fetch licenses with assignments
  const fetchLicenses = useCallback(async () => {
    if (!organization?.id) {
      log.debug('[SWLicense]', 'No organization ID, skipping license fetch')
      return
    }
    
    log.info('[SWLicense]', 'Fetching licenses for org', { orgId: organization.id })
    
    try {
      // Fetch licenses
      const { data: licensesData, error: licensesError } = await db
        .from('solidworks_licenses')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false })
      
      if (licensesError) {
        log.error('[SWLicense]', 'Failed to fetch licenses', { error: licensesError })
        throw licensesError
      }
      
      log.debug('[SWLicense]', 'Fetched licenses', { count: licensesData?.length || 0 })
      
      // Fetch assignments with user info
      // Must specify the FK because there are two relationships to users (user_id and assigned_by)
      const { data: assignmentsData, error: assignmentsError } = await db
        .from('solidworks_license_assignments')
        .select(`
          *,
          user:users!solidworks_license_assignments_user_id_fkey(id, email, full_name, avatar_url)
        `)
        .in('license_id', licensesData?.map((l: SolidWorksLicense) => l.id) || [])
      
      if (assignmentsError) {
        log.error('[SWLicense]', 'Failed to fetch assignments', { error: assignmentsError })
        throw assignmentsError
      }
      
      log.debug('[SWLicense]', 'Fetched assignments', { count: assignmentsData?.length || 0 })
      
      // Fetch pending org members with license pre-assignments
      const { data: pendingMembers, error: pendingError } = await db
        .from('pending_org_members')
        .select('id, email, full_name, solidworks_license_ids')
        .eq('org_id', organization.id)
        .is('claimed_at', null)
        .not('solidworks_license_ids', 'eq', '{}')
      
      if (pendingError) {
        log.warn('[SWLicense]', 'Failed to fetch pending license assignments', { error: pendingError })
        // Non-fatal - continue without pending assignments
      }
      
      log.debug('[SWLicense]', 'Fetched pending assignments', { count: pendingMembers?.length || 0 })
      
      // Build a map of license_id -> pending member for quick lookup
      const pendingAssignmentMap = new Map<string, PendingAssignment>()
      for (const member of pendingMembers || []) {
        for (const licenseId of member.solidworks_license_ids || []) {
          pendingAssignmentMap.set(licenseId, {
            pending_member_id: member.id,
            email: member.email,
            full_name: member.full_name
          })
        }
      }
      
      // Merge licenses with assignments (active and pending)
      const licensesWithAssignments: LicenseWithAssignment[] = (licensesData || []).map(
        (license: SolidWorksLicense) => {
          const assignment = assignmentsData?.find(
            (a: { license_id: string }) => a.license_id === license.id
          )
          const pendingAssignment = pendingAssignmentMap.get(license.id)
          return { ...license, assignment, pendingAssignment }
        }
      )
      
      setLicenses(licensesWithAssignments)
      setError(null)
      log.info('[SWLicense]', 'Licenses loaded successfully', { 
        total: licensesWithAssignments.length,
        assigned: licensesWithAssignments.filter(l => l.assignment).length,
        pending: licensesWithAssignments.filter(l => l.pendingAssignment).length
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch licenses'
      log.error('[SWLicense]', 'License fetch failed', { error: err, message })
      setError(message)
      addToast('error', message)
    }
  }, [organization?.id, addToast])
  
  // Fetch org users for assignment dropdown (includes active users + pending invites)
  const fetchOrgUsers = useCallback(async () => {
    if (!organization?.id) return
    
    try {
      // Fetch active users
      const { data: usersData, error: usersErr } = await db
        .from('users')
        .select('id, email, full_name, avatar_url')
        .eq('org_id', organization.id)
        .order('full_name', { ascending: true })
      
      if (usersErr) throw usersErr
      
      // Fetch pending org members (invites)
      const { data: pendingData, error: pendingErr } = await db
        .from('pending_org_members')
        .select('id, email, full_name')
        .eq('org_id', organization.id)
        .is('claimed_at', null)
        .order('full_name', { ascending: true })
      
      if (pendingErr) throw pendingErr
      
      // Combine active users and pending members
      const activeUsers: OrgUser[] = (usersData || []).map((u: { id: string; email: string; full_name: string | null; avatar_url: string | null }) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        avatar_url: u.avatar_url,
        is_pending: false
      }))
      
      const pendingUsers: OrgUser[] = (pendingData || []).map((p: { id: string; email: string; full_name: string | null }) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        avatar_url: null,
        is_pending: true
      }))
      
      // Active users first, then pending
      setOrgUsers([...activeUsers, ...pendingUsers])
    } catch (err) {
      console.error('Failed to fetch org users:', err)
    }
  }, [organization?.id])
  
  // Initial load
  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await Promise.all([fetchLicenses(), fetchOrgUsers()])
      setIsLoading(false)
    }
    load()
  }, [fetchLicenses, fetchOrgUsers])
  
  // Realtime subscription
  useEffect(() => {
    if (!organization?.id) return
    
    const licensesChannel = supabase
      .channel('solidworks_licenses_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'solidworks_licenses',
          filter: `org_id=eq.${organization.id}`
        },
        () => {
          fetchLicenses()
        }
      )
      .subscribe()
    
    const assignmentsChannel = supabase
      .channel('solidworks_license_assignments_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'solidworks_license_assignments'
        },
        () => {
          fetchLicenses()
        }
      )
      .subscribe()
    
    return () => {
      licensesChannel.unsubscribe()
      assignmentsChannel.unsubscribe()
    }
  }, [organization?.id, fetchLicenses])
  
  // Add a new license
  const addLicense = useCallback(async (license: Omit<SolidWorksLicenseInsert, 'org_id' | 'created_by'>): Promise<{ success: boolean; licenseId?: string; error?: string }> => {
    if (!organization?.id || !user?.id) {
      log.warn('[SWLicense]', 'Add license failed: no organization or user')
      addToast('error', 'No organization or user found')
      return { success: false }
    }
    
    log.info('[SWLicense]', 'Adding new license', { 
      serial: maskSerialForLog(license.serial_number),
      nickname: license.nickname,
      type: license.license_type 
    })
    
    try {
      const { data, error: err } = await db
        .from('solidworks_licenses')
        .insert({
          ...license,
          org_id: organization.id,
          created_by: user.id
        })
        .select('id')
        .single()
      
      if (err) {
        log.error('[SWLicense]', 'Failed to insert license', { error: err })
        throw err
      }
      
      log.info('[SWLicense]', 'License added successfully', { 
        serial: maskSerialForLog(license.serial_number),
        licenseId: data?.id
      })
      addToast('success', 'License added successfully')
      return { success: true, licenseId: data?.id }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add license'
      log.error('[SWLicense]', 'Add license failed', { error: err, message })
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [organization?.id, user?.id, addToast])
  
  // Update a license
  const updateLicense = useCallback(async (licenseId: string, updates: SolidWorksLicenseUpdate) => {
    try {
      const { error: err } = await db
        .from('solidworks_licenses')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', licenseId)
      
      if (err) throw err
      
      addToast('success', 'License updated')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update license'
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast])
  
  // Delete a license
  const deleteLicense = useCallback(async (licenseId: string) => {
    try {
      const { error: err } = await db
        .from('solidworks_licenses')
        .delete()
        .eq('id', licenseId)
      
      if (err) throw err
      
      addToast('success', 'License deleted')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete license'
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast])
  
  // Assign license to user (using database function)
  // For pending users, this adds the license to their pending assignments
  const assignLicense = useCallback(async (licenseId: string, recipientId: string, isPending: boolean = false) => {
    log.info('[SWLicense]', 'Assigning license', { licenseId, recipientId, isPending })
    
    try {
      if (isPending) {
        // For pending users, add to their pending license list
        const { data, error: err } = await db
          .rpc('add_pending_license_assignment', {
            p_pending_member_id: recipientId,
            p_license_id: licenseId
          })
        
        if (err) {
          log.error('[SWLicense]', 'RPC add_pending_license_assignment failed', { error: err })
          throw err
        }
        if (!data?.success) {
          log.error('[SWLicense]', 'Pending assignment function returned error', { error: data?.error })
          throw new Error(data?.error || 'Assignment failed')
        }
        
        log.info('[SWLicense]', 'License pre-assigned to pending user', { licenseId, pendingMemberId: recipientId })
        addToast('success', 'License will be assigned when user signs up')
        await fetchLicenses() // Refresh to show pending assignment
        return { success: true }
      } else {
        // For active users, create actual assignment
        const { data, error: err } = await db
          .rpc('assign_solidworks_license', {
            p_license_id: licenseId,
            p_user_id: recipientId
          })
        
        if (err) {
          log.error('[SWLicense]', 'RPC assign_solidworks_license failed', { error: err })
          throw err
        }
        if (!data?.success) {
          log.error('[SWLicense]', 'Assignment function returned error', { error: data?.error })
          throw new Error(data?.error || 'Assignment failed')
        }
        
        log.info('[SWLicense]', 'License assigned successfully', { 
          licenseId, 
          userId: recipientId, 
          assignmentId: data.assignment_id 
        })
        addToast('success', 'License assigned')
        return { success: true }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign license'
      log.error('[SWLicense]', 'Assign license failed', { error: err, message })
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast, fetchLicenses])
  
  // Unassign license (using database function)
  const unassignLicense = useCallback(async (assignmentId: string) => {
    try {
      const { data, error: err } = await db
        .rpc('unassign_solidworks_license', {
          p_assignment_id: assignmentId
        })
      
      if (err) throw err
      if (!data?.success) throw new Error(data?.error || 'Unassignment failed')
      
      addToast('success', 'License unassigned')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unassign license'
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast])
  
  // Unassign license from pending member
  const unassignPendingLicense = useCallback(async (pendingMemberId: string, licenseId: string) => {
    log.info('[SWLicense]', 'Unassigning license from pending user', { pendingMemberId, licenseId })
    
    try {
      const { data, error: err } = await db
        .rpc('remove_pending_license_assignment', {
          p_pending_member_id: pendingMemberId,
          p_license_id: licenseId
        })
      
      if (err) {
        log.error('[SWLicense]', 'RPC remove_pending_license_assignment failed', { error: err })
        throw err
      }
      if (!data?.success) {
        log.error('[SWLicense]', 'Pending unassignment function returned error', { error: data?.error })
        throw new Error(data?.error || 'Unassignment failed')
      }
      
      log.info('[SWLicense]', 'Pending license assignment removed', { pendingMemberId, licenseId })
      addToast('success', 'Pending assignment removed')
      await fetchLicenses() // Refresh to update the UI
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove pending assignment'
      log.error('[SWLicense]', 'Unassign pending license failed', { error: err, message })
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast, fetchLicenses])
  
  // Push license to Windows registry
  const pushToRegistry = useCallback(async (serialNumber: string) => {
    log.info('[SWLicense]', 'Pushing license to registry', { serial: maskSerialForLog(serialNumber) })
    
    try {
      // Check if already in registry
      log.debug('[SWLicense]', 'Checking if license exists in registry')
      const checkResult = await window.electronAPI?.solidworks?.checkLicenseRegistry(serialNumber)
      
      if (checkResult?.found) {
        log.info('[SWLicense]', 'License already exists in registry', { serial: maskSerialForLog(serialNumber) })
        addToast('info', 'License is already activated on this machine')
        return { success: true, alreadyExists: true }
      }
      
      // Push to registry
      log.debug('[SWLicense]', 'Writing license to registry')
      const result = await window.electronAPI?.solidworks?.setLicenseRegistry(serialNumber)
      
      if (!result?.success) {
        if (result?.requiresAdmin) {
          log.warn('[SWLicense]', 'Registry write requires admin privileges')
          addToast('warning', 'Administrator privileges required. Please run BluePLM as Administrator.')
          return { success: false, requiresAdmin: true }
        }
        log.error('[SWLicense]', 'Registry write failed', { error: result?.error })
        throw new Error(result?.error || 'Failed to write to registry')
      }
      
      log.info('[SWLicense]', 'License activated in registry', { serial: maskSerialForLog(serialNumber) })
      addToast('success', 'License activated in Windows registry')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to push to registry'
      log.error('[SWLicense]', 'Push to registry failed', { error: err, message })
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast])
  
  // Activate license (mark as active in database after pushing to registry)
  const activateLicense = useCallback(async (assignmentId: string, machineId: string, machineName: string) => {
    try {
      const { data, error: err } = await db
        .rpc('activate_solidworks_license', {
          p_assignment_id: assignmentId,
          p_machine_id: machineId,
          p_machine_name: machineName
        })
      
      if (err) throw err
      if (!data?.success) throw new Error(data?.error || 'Activation failed')
      
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to activate license'
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast])
  
  // Deactivate license
  const deactivateLicense = useCallback(async (assignmentId: string) => {
    try {
      const { data, error: err } = await db
        .rpc('deactivate_solidworks_license', {
          p_assignment_id: assignmentId
        })
      
      if (err) throw err
      if (!data?.success) throw new Error(data?.error || 'Deactivation failed')
      
      addToast('success', 'License deactivated')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deactivate license'
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast])
  
  // Remove license from Windows registry
  const removeFromRegistry = useCallback(async (serialNumber: string) => {
    log.info('[SWLicense]', 'Removing license from registry', { serial: maskSerialForLog(serialNumber) })
    
    try {
      const result = await window.electronAPI?.solidworks?.removeLicenseRegistry(serialNumber)
      
      if (!result?.success) {
        if (result?.requiresAdmin) {
          log.warn('[SWLicense]', 'Registry remove requires admin privileges')
          addToast('warning', 'Administrator privileges required')
          return { success: false, requiresAdmin: true }
        }
        log.error('[SWLicense]', 'Registry remove failed', { error: result?.error })
        throw new Error(result?.error || 'Failed to remove from registry')
      }
      
      log.info('[SWLicense]', 'License removed from registry', { serial: maskSerialForLog(serialNumber) })
      addToast('success', 'License removed from Windows registry')
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove from registry'
      log.error('[SWLicense]', 'Remove from registry failed', { error: err, message })
      addToast('error', message)
      return { success: false, error: message }
    }
  }, [addToast])
  
  // Get license status for display
  const getLicenseStatus = useCallback((license: LicenseWithAssignment): LicenseStatus => {
    if (!license.assignment) return 'unassigned'
    if (license.assignment.is_active) return 'active'
    return 'assigned'
  }, [])
  
  return {
    licenses,
    orgUsers,
    isLoading,
    error,
    addLicense,
    updateLicense,
    deleteLicense,
    assignLicense,
    unassignLicense,
    unassignPendingLicense,
    pushToRegistry,
    activateLicense,
    deactivateLicense,
    removeFromRegistry,
    getLicenseStatus,
    refetch: fetchLicenses
  }
}
