import { safeStorage } from 'electron'

const ENC = 'enc:'
const INSECURE = 'insecure:'

export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Encrypt for disk. Falls back to marked insecure encoding if OS keychain unavailable. */
export function encryptSecret(plain: string): string {
  if (!plain) return ''
  if (isEncryptionAvailable()) {
    return ENC + safeStorage.encryptString(plain).toString('base64')
  }
  console.warn('[mxwl] safeStorage unavailable — secret stored with insecure: prefix')
  return INSECURE + Buffer.from(plain, 'utf8').toString('base64')
}

export function decryptSecret(blob: string): string {
  if (!blob) return ''
  if (blob.startsWith(ENC)) {
    try {
      return safeStorage.decryptString(Buffer.from(blob.slice(ENC.length), 'base64'))
    } catch {
      return ''
    }
  }
  if (blob.startsWith(INSECURE)) {
    try {
      return Buffer.from(blob.slice(INSECURE.length), 'base64').toString('utf8')
    } catch {
      return ''
    }
  }
  // Legacy: raw safeStorage base64, or plaintext fallback from older builds
  if (isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(blob, 'base64'))
    } catch {
      return blob
    }
  }
  return blob
}

export function secretIsInsecure(blob: string | undefined | null): boolean {
  return Boolean(blob?.startsWith(INSECURE))
}
