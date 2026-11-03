import type { EchologPrincipal } from '../auth.js'

export interface LogContext {
  requestId: string
  timestamp: number
  host: string
  port: number
  method: string
  url: string
  userAgent?: string
  principal?: EchologPrincipal
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'