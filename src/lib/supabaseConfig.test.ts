import { describe, expect, it } from 'vitest'
import { isHostedSupabaseUrl } from './supabaseConfig'

describe('isHostedSupabaseUrl', () => {
  it('accepts hosted Supabase projects, which BluePLM Web can reach', () => {
    expect(isHostedSupabaseUrl('https://abcdefghijklmnopqrst.supabase.co')).toBe(true)
    expect(isHostedSupabaseUrl('https://abc.supabase.co/')).toBe(true)
  })

  it('refuses self-hosted, plain-http and look-alike hosts', () => {
    expect(isHostedSupabaseUrl('https://supabase.example.com')).toBe(false)
    expect(isHostedSupabaseUrl('http://abc.supabase.co')).toBe(false)
    expect(isHostedSupabaseUrl('https://abc.supabase.co.evil.com')).toBe(false)
    expect(isHostedSupabaseUrl('https://supabase.co')).toBe(false)
    expect(isHostedSupabaseUrl('not a url')).toBe(false)
  })
})
