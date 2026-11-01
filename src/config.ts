import { z } from 'zod'
import { resolve } from 'node:path'

const DEFAULT_MIME_TYPES = [
  'application/octet-stream',
  'application/pdf',
  'application/zip',
  'audio/flac',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]

const ConfigSchema = z.object({
  host: z.string().trim().min(1).default('127.0.0.1'),
  port: z.coerce.number().int().min(1).max(65535).default(3006),
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  databasePath: z.string().trim().min(1).default('./data/echolog/echolog.db'),
  sessionTtlHours: z.coerce.number().int().positive().max(24 * 90).default(24 * 7),
  cookieSecure: z.enum(['auto', 'true', 'false']).default('auto'),
  bootstrapAdminLogin: z.string().trim().default(''),
  bootstrapAdminPassword: z.string().default(''),
  grantSigningSecret: z.string().default(''),
  serviceKey: z.string().default(''),
  arsyUrl: z.string().default(''),
  s3Bucket: z.string().trim().default(''),
  s3Region: z.string().trim().min(1).default('us-east-1'),
  s3AccessKeyId: z.string().default(''),
  s3SecretAccessKey: z.string().default(''),
  storageRoot: z.string().trim().min(1).default('./data/echolog'),
  storageQuotaBytes: z.coerce.number().int().positive().default(10 * 1024 * 1024 * 1024),
  maxUploadBytes: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  allowedMimeTypes: z.string().default(DEFAULT_MIME_TYPES.join(',')),
})

export interface EchologConfig {
  host: string
  port: number
  nodeEnv: 'development' | 'test' | 'production'
  databasePath: string
  sessionTtlHours: number
  cookieSecure: 'auto' | 'true' | 'false'
  bootstrapAdminLogin: string
  bootstrapAdminPassword: string
  grantSigningSecret: string
  /** Shared daemon credential for `x-echolog-key`; empty disables that mode. */
  serviceKey: string
  /** Hub base URL for bearer federation; empty keeps authentication local. */
  arsyUrl: string
  s3Bucket: string
  s3Region: string
  s3AccessKeyId: string
  s3SecretAccessKey: string
  storageRoot: string
  storageQuotaBytes: number
  maxUploadBytes: number
  allowedMimeTypes: string[]
}

export function parseConfig(
  environment: Record<string, string | undefined>,
  args: readonly string[] = [],
): EchologConfig {
  let requestedPort: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--port') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Invalid command line configuration: --port requires an integer from 1 to 65535.')
      }
      if (requestedPort !== undefined) {
        throw new Error('Invalid command line configuration: --port may be provided only once.')
      }
      requestedPort = value
      index += 1
    } else if (argument?.startsWith('--port=')) {
      if (requestedPort !== undefined) {
        throw new Error('Invalid command line configuration: --port may be provided only once.')
      }
      requestedPort = argument.slice('--port='.length)
    }
  }

  const parsed = ConfigSchema.safeParse({
    host: environment.ECHOLOG_HOST,
    port: requestedPort ?? environment.ECHOLOG_PORT,
    nodeEnv: environment.NODE_ENV,
    databasePath: environment.ECHOLOG_DATABASE_PATH,
    sessionTtlHours: environment.ECHOLOG_SESSION_TTL_HOURS,
    cookieSecure: environment.ECHOLOG_COOKIE_SECURE,
    bootstrapAdminLogin: environment.ECHOLOG_ADMIN_LOGIN,
    bootstrapAdminPassword: environment.ECHOLOG_ADMIN_PASSWORD,
    grantSigningSecret: environment.ECHOLOG_GRANT_SECRET,
    serviceKey: environment.ECHOLOG_SERVICE_KEY,
    arsyUrl: environment.ECHOLOG_ARSY_URL,
    s3Bucket: environment.ECHOLOG_S3_BUCKET,
    s3Region: environment.ECHOLOG_S3_REGION,
    s3AccessKeyId: environment.ECHOLOG_S3_ACCESS_KEY_ID,
    s3SecretAccessKey: environment.ECHOLOG_S3_SECRET_ACCESS_KEY,
    storageRoot: environment.ECHOLOG_STORAGE_ROOT,
    storageQuotaBytes: environment.ECHOLOG_STORAGE_QUOTA_BYTES,
    maxUploadBytes: environment.ECHOLOG_MAX_UPLOAD_BYTES,
    allowedMimeTypes: environment.ECHOLOG_ALLOWED_MIME_TYPES,
  })
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; ')
    throw new Error(`Invalid ECHOLOG configuration: ${details}`)
  }

  const mimeTypes = parsed.data.allowedMimeTypes.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (mimeTypes.length === 0 || mimeTypes.some((value) => !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value))) {
    throw new Error('Invalid ECHOLOG configuration: allowed MIME types must be a non-empty comma-separated list.')
  }
  if (Boolean(parsed.data.bootstrapAdminLogin) !== Boolean(parsed.data.bootstrapAdminPassword)) {
    throw new Error('Invalid ECHOLOG configuration: the bootstrap admin login and password must be set together.')
  }
  if (parsed.data.bootstrapAdminPassword.length > 0 && parsed.data.bootstrapAdminPassword.length < 12) {
    throw new Error('Invalid ECHOLOG configuration: the bootstrap admin password must be at least 12 characters.')
  }
  if (parsed.data.grantSigningSecret.length > 0 && parsed.data.grantSigningSecret.length < 32) {
    throw new Error('Invalid ECHOLOG configuration: grant secret must be at least 32 characters when configured.')
  }
  if (parsed.data.serviceKey.length > 0 && parsed.data.serviceKey.length < 32) {
    throw new Error('Invalid ECHOLOG configuration: ECHOLOG_SERVICE_KEY must be at least 32 characters when configured.')
  }
  if (parsed.data.serviceKey.length > 256) {
    throw new Error('Invalid ECHOLOG configuration: ECHOLOG_SERVICE_KEY exceeds the supported length.')
  }
  if (parsed.data.arsyUrl.length > 0) {
    let hubUrl: URL | null = null
    try {
      hubUrl = new URL(parsed.data.arsyUrl)
    } catch {
      hubUrl = null
    }
    if (!hubUrl || (hubUrl.protocol !== 'http:' && hubUrl.protocol !== 'https:')) {
      throw new Error('Invalid ECHOLOG configuration: ECHOLOG_ARSY_URL must be an absolute http(s) URL.')
    }
  }
  if (Boolean(parsed.data.s3AccessKeyId) !== Boolean(parsed.data.s3SecretAccessKey)) {
    throw new Error('Invalid ECHOLOG configuration: S3 access key id and secret access key must be configured together.')
  }
  if (parsed.data.s3Bucket && (!parsed.data.s3AccessKeyId || !parsed.data.s3SecretAccessKey)) {
    throw new Error('Invalid ECHOLOG configuration: S3 bucket requires S3 access key id and secret access key.')
  }
  if ((parsed.data.s3AccessKeyId || parsed.data.s3SecretAccessKey) && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(parsed.data.s3Bucket)) {
    throw new Error('Invalid ECHOLOG configuration: S3 credentials require a valid single bucket name.')
  }
  if ((parsed.data.s3AccessKeyId.length > 128) || (parsed.data.s3SecretAccessKey.length > 256)) {
    throw new Error('Invalid ECHOLOG configuration: S3 credentials exceed the supported length.')
  }
  if (parsed.data.nodeEnv === 'production') {
    if (!parsed.data.grantSigningSecret) {
      throw new Error('Invalid ECHOLOG production configuration: ECHOLOG_GRANT_SECRET is required.')
    }
    if (!parsed.data.s3Bucket) {
      throw new Error('Invalid ECHOLOG production configuration: ECHOLOG_S3_BUCKET is required.')
    }
  }

  return {
    ...parsed.data,
    allowedMimeTypes: [...new Set(mimeTypes)],
    storageRoot: resolve(parsed.data.storageRoot),
  }
}

export function loadConfig(): EchologConfig {
  return parseConfig(process.env, process.argv.slice(2))
}
