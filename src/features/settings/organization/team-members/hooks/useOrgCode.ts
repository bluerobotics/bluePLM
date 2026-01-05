import { useState, useCallback } from 'react'
import { copyToClipboard } from '@/lib/clipboard'

export function useOrgCode() {
  const [showOrgCode, setShowOrgCode] = useState(false)
  const [orgCode, setOrgCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  
  const copyCode = useCallback(async () => {
    if (!orgCode) return false
    
    const result = await copyToClipboard(orgCode)
    if (result.success) {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
      return true
    }
    return false
  }, [orgCode])
  
  const hideCode = useCallback(() => {
    setShowOrgCode(false)
    setOrgCode(null)
    setCodeCopied(false)
  }, [])
  
  return {
    showOrgCode,
    setShowOrgCode,
    orgCode,
    setOrgCode,
    codeCopied,
    setCodeCopied,
    copyCode,
    hideCode
  }
}
