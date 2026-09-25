import { getSupabaseClient } from './client'

import { log } from '@/lib/logger'
import type { ItemImage } from '@/types/item'
import {
  getCommunityItemImages,
  getCommunityVault,
  getCommunityVaults,
  resetCommunityItemImage,
  setCommunityItemImage,
} from '@/lib/community'
import { buildFullPath } from '@/lib/utils/path'
import { routeBackend } from '@/lib/backendAdapter'

const VAULT_BUCKET = 'vault'
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 // 1 year (matches avatar/logo uploads)
const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2 MB

// Shape returned by the item_images RPCs (snake_case, matches the DB row)
interface ItemImageRow {
  part_number: string
  image_type: ItemImage['type']
  icon_name: string | null
  icon_color: string | null
  image_storage_path: string | null
}

// Supabase v2 does not infer types for RPCs that are not yet in the generated
// supabase.ts. Cast to a loose caller until the types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<any> } // TODO: type this after supabase types regen

function sanitizePartNumber(partNumber: string): string {
  return partNumber.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 120) || 'item'
}

async function resolveSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.storage
    .from(VAULT_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
  if (error) {
    log.error('[ItemImages]', 'Failed to sign item image URL', { error })
    return null
  }
  return data?.signedUrl ?? null
}

function toItemImage(row: ItemImageRow, imageUrl: string | null): ItemImage {
  return {
    partNumber: row.part_number,
    type: row.image_type,
    iconName: row.icon_name,
    iconColor: row.icon_color,
    imageUrl,
    storagePath: row.image_storage_path,
  }
}

/**
 * Load all per-item image overrides for an org, keyed by part number. Items
 * with no override row use the default SolidWorks preview and are absent here.
 */
export async function getItemImages(orgId: string): Promise<Map<string, ItemImage>> {
  return routeBackend({
    mdb: async () => {
      const result = new Map<string, ItemImage>()
      try {
        const rows = await getCommunityItemImages()
        await Promise.all(
          rows.map(async (row) => {
            let imageUrl: string | null = null
            if (row.imageType === 'image' && row.storageRelativePath) {
              const vault = await getCommunityVault(row.vaultId)
              if (vault.storageProvider === 'network' && vault.networkRoot && window.electronAPI) {
                const read = await window.electronAPI.readFile(
                  buildFullPath(vault.networkRoot, row.storageRelativePath),
                )
                if (read.success && read.data) imageUrl = `data:image/*;base64,${read.data}`
              }
            }
            result.set(row.partNumber, {
              partNumber: row.partNumber,
              type: row.imageType,
              iconName: row.iconName,
              iconColor: row.iconColor,
              imageUrl,
              storagePath: row.storageRelativePath,
            })
          }),
        )
      } catch (error) {
        log.error('[ItemImages]', 'Failed to load Community item images', { error })
      }
      return result
    },
    supabase: async () => {
      const supabase = getSupabaseClient() as unknown as RpcClient
      const result = new Map<string, ItemImage>()
      try {
        const { data, error } = await supabase.rpc('get_item_images', { p_org_id: orgId })
        if (error) throw error
        const rows = (data ?? []) as ItemImageRow[]

        await Promise.all(
          rows.map(async (row) => {
            const imageUrl =
              row.image_type === 'image' && row.image_storage_path
                ? await resolveSignedUrl(row.image_storage_path)
                : null
            result.set(row.part_number, toItemImage(row, imageUrl))
          }),
        )
        return result
      } catch (error) {
        log.error('[ItemImages]', 'Failed to load item images', { error })
        return result
      }
    },
  })
}

/** Set an item's override to a Lucide icon (optionally colored). */
export async function setItemIcon(
  orgId: string,
  partNumber: string,
  iconName: string,
  iconColor?: string | null,
  vaultId?: string,
): Promise<ItemImage> {
  return routeBackend({
    mdb: async () => {
      const vault = vaultId ? await getCommunityVault(vaultId) : (await getCommunityVaults())[0]
      if (!vault) throw new Error('Select a vault before assigning an item icon.')
      const row = await setCommunityItemImage(partNumber, {
        vaultId: vault.id,
        imageType: 'icon',
        iconName,
        iconColor: iconColor ?? null,
        storageRelativePath: null,
      })
      return {
        partNumber: row.partNumber,
        type: row.imageType,
        iconName: row.iconName,
        iconColor: row.iconColor,
        imageUrl: null,
        storagePath: null,
      }
    },
    supabase: async () => {
      const supabase = getSupabaseClient() as unknown as RpcClient
      const { data, error } = await supabase.rpc('upsert_item_image', {
        p_org_id: orgId,
        p_part_number: partNumber,
        p_image_type: 'icon',
        p_icon_name: iconName,
        p_icon_color: iconColor ?? null,
        p_image_storage_path: null,
      })
      if (error) throw error
      return toItemImage(data as ItemImageRow, null)
    },
  })
}

/** Upload an image for an item and set it as the item's override. */
export async function uploadItemImage(
  orgId: string,
  partNumber: string,
  file: File,
  vaultId?: string,
): Promise<ItemImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image must be 2 MB or smaller')
  }

  return routeBackend({
    mdb: async () => {
      const vault = vaultId ? await getCommunityVault(vaultId) : (await getCommunityVaults())[0]
      if (!vault) throw new Error('Select a vault before uploading an item image.')
      if (!window.electronAPI)
        throw new Error('Item image upload requires the BluePLM desktop client.')
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      let storagePath: string
      let imageUrl: string
      if (vault.storageProvider === 'network') {
        if (!vault.networkRoot) throw new Error('The Community network vault root is missing.')
        storagePath = `.blueplm/assets/item-images/${sanitizePartNumber(partNumber)}-${crypto.randomUUID()}.${ext}`
        const bytes = new Uint8Array(await file.arrayBuffer())
        // Avoid spreading a multi-megabyte image into one function call: Chromium
        // otherwise throws before the image reaches the network vault.
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 0x8000)
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
        const base64 = btoa(binary)
        const written = await window.electronAPI.writeFile(
          buildFullPath(vault.networkRoot, storagePath),
          base64,
        )
        if (!written.success)
          throw new Error(written.error || 'Failed to write item image to vault.')
        imageUrl = `data:${file.type || 'image/png'};base64,${base64}`
      } else {
        throw new Error('MDB supports Network Vault storage only.')
      }
      const row = await setCommunityItemImage(partNumber, {
        vaultId: vault.id,
        imageType: 'image',
        iconName: null,
        iconColor: null,
        storageRelativePath: storagePath,
      })
      return {
        partNumber: row.partNumber,
        type: row.imageType,
        iconName: null,
        iconColor: null,
        imageUrl,
        storagePath,
      }
    },
    supabase: async () => {
      const supabase = getSupabaseClient()
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const storagePath = `${orgId}/_assets/item-images/${sanitizePartNumber(partNumber)}-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(VAULT_BUCKET)
        .upload(storagePath, file, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError

      const rpcClient = supabase as unknown as RpcClient
      const { data, error } = await rpcClient.rpc('upsert_item_image', {
        p_org_id: orgId,
        p_part_number: partNumber,
        p_image_type: 'image',
        p_icon_name: null,
        p_icon_color: null,
        p_image_storage_path: storagePath,
      })
      if (error) throw error

      const imageUrl = await resolveSignedUrl(storagePath)
      return toItemImage(data as ItemImageRow, imageUrl)
    },
  })
}

/** Remove an item's override, reverting to the default SolidWorks preview. */
export async function resetItemImage(orgId: string, partNumber: string): Promise<void> {
  return routeBackend({
    mdb: async () => {
      await resetCommunityItemImage(partNumber)
      return
    },
    supabase: async () => {
      const supabase = getSupabaseClient() as unknown as RpcClient
      const { error } = await supabase.rpc('reset_item_image', {
        p_org_id: orgId,
        p_part_number: partNumber,
      })
      if (error) throw error
    },
  })
}
