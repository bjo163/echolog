import { EventEmitter } from 'node:events'

export interface EchologEventPayloads {
  'object.created': {
    digest: string
    key: string
    filename: string
    contentType: string
    size: number
    uploader?: string
    timestamp: string
  }
  'object.deleted': {
    key: string
    uploader?: string
    timestamp: string
  }
  'ai.indexed': {
    digest: string
    filename: string
    dimensions: number
    timestamp: string
  }
  'security.honeypot_triggered': {
    digest: string
    targetPath: string
    attackerIp?: string
    quarantinedUser?: string
    timestamp: string
  }
  'branch.created': {
    name: string
    commitCount: number
    timestamp: string
  }
  'branch.deleted': {
    name: string
    timestamp: string
  }
  'scrubber.corruption_detected': {
    digest: string
    expectedDigest: string
    actualDigest: string
    autoHealed: boolean
    timestamp: string
  }
}

export type EchologEventType = keyof EchologEventPayloads

export interface EchologBroadcastEvent<T extends EchologEventType = EchologEventType> {
  id: string
  type: T
  data: EchologEventPayloads[T]
  timestamp: string
}

export class EchologEventBus {
  private static instance: EchologEventBus
  private emitter: EventEmitter
  private sequence = 0

  private constructor() {
    this.emitter = new EventEmitter()
    // Increase max listeners for multiple SSE client connections
    this.emitter.setMaxListeners(100)
  }

  public static getInstance(): EchologEventBus {
    if (!EchologEventBus.instance) {
      EchologEventBus.instance = new EchologEventBus()
    }
    return EchologEventBus.instance
  }

  public publish<T extends EchologEventType>(type: T, payload: EchologEventPayloads[T]): EchologBroadcastEvent<T> {
    this.sequence++
    const event: EchologBroadcastEvent<T> = {
      id: `${Date.now()}-${this.sequence}`,
      type,
      data: payload,
      timestamp: new Date().toISOString(),
    }

    this.emitter.emit(type, event)
    this.emitter.emit('*', event)
    return event
  }

  public subscribe<T extends EchologEventType>(
    type: T,
    listener: (event: EchologBroadcastEvent<T>) => void,
  ): () => void {
    this.emitter.on(type, listener as (...args: any[]) => void)
    return () => {
      this.emitter.off(type, listener as (...args: any[]) => void)
    }
  }

  public subscribeAll(listener: (event: EchologBroadcastEvent) => void): () => void {
    this.emitter.on('*', listener)
    return () => {
      this.emitter.off('*', listener)
    }
  }
}

export const eventBus = EchologEventBus.getInstance()
