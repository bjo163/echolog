/**
 * Pre-upload validation.
 *
 * The server is the authority on what it accepts, but an operator should not
 * have to upload 500 MB to be told the file is the wrong type. The rules here
 * mirror the server's own limits, and every issue names the limit it broke so
 * the reason is never a guess.
 */

export interface UploadLimits {
  maxUploadBytes: number
  allowedMimeTypes: readonly string[]
  storageQuotaBytes: number
  usedBytes: number | null
}

export interface UploadCandidate {
  filename: string
  contentType: string
  size: number
  retentionUntil: string | null
  legalHold: boolean
}

export type UploadIssueSeverity = 'error' | 'warning'

export interface UploadIssue {
  field: 'filename' | 'contentType' | 'size' | 'quota' | 'retentionUntil' | 'legalHold'
  severity: UploadIssueSeverity
  message: string
}

export interface UploadValidation {
  issues: UploadIssue[]
  canUpload: boolean
}

/** Local byte formatter, so the module stays free of UI dependencies. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1)
  return rounded + ' ' + units[unit]
}

/**
 * Checks a candidate against the instance limits.
 *
 * Every issue names the rule it broke. A warning never blocks the upload, so
 * an operator still sees what a legal hold would mean before committing.
 */
export function validateUpload(candidate: UploadCandidate, limits: UploadLimits): UploadValidation {
  const issues: UploadIssue[] = []

  const name = candidate.filename.trim()
  if (!name) {
    issues.push({ field: 'filename', severity: 'error', message: 'A filename is required.' })
  } else if (name.includes('/') || name.includes(String.fromCharCode(92))) {
    issues.push({ field: 'filename', severity: 'error', message: 'The filename must not contain a directory path.' })
  }

  const contentType = candidate.contentType.trim().toLowerCase()
  if (!contentType) {
    issues.push({ field: 'contentType', severity: 'error', message: 'A content type is required.' })
  } else if (limits.allowedMimeTypes.length > 0 && !limits.allowedMimeTypes.includes(contentType)) {
    issues.push({
      field: 'contentType',
      severity: 'error',
      message: 'The content type ' + contentType + ' is not in the accepted list for this instance.',
    })
  }

  if (candidate.size <= 0) {
    issues.push({ field: 'size', severity: 'error', message: 'The selected file is empty.' })
  } else if (candidate.size > limits.maxUploadBytes) {
    issues.push({
      field: 'size',
      severity: 'error',
      message: 'The file is larger than the ' + formatBytes(limits.maxUploadBytes) + ' upload limit for this instance.',
    })
  }

  if (limits.usedBytes !== null && candidate.size > 0) {
    const projected = limits.usedBytes + candidate.size
    if (projected > limits.storageQuotaBytes) {
      issues.push({
        field: 'quota',
        severity: 'error',
        message: 'This upload would exceed the ' + formatBytes(limits.storageQuotaBytes) + ' storage quota for this instance.',
      })
    } else if (projected > limits.storageQuotaBytes * 0.9) {
      issues.push({
        field: 'quota',
        severity: 'warning',
        message: 'This upload brings storage use to ' + formatBytes(projected) + ' of ' + formatBytes(limits.storageQuotaBytes) + '.',
      })
    }
  }

  if (candidate.retentionUntil) {
    const parsed = Date.parse(candidate.retentionUntil)
    if (!Number.isFinite(parsed)) {
      issues.push({ field: 'retentionUntil', severity: 'error', message: 'The retention date is not a valid date.' })
    } else if (parsed <= Date.now()) {
      issues.push({ field: 'retentionUntil', severity: 'error', message: 'The retention date must be in the future.' })
    }
  }

  if (candidate.legalHold) {
    issues.push({
      field: 'legalHold',
      severity: 'warning',
      message: 'A legal hold can only be set by an administrator or a service credential.',
    })
  }

  return { issues, canUpload: !issues.some((issue) => issue.severity === 'error') }
}
