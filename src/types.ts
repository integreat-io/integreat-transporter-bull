import type {
  Dispatch,
  AuthenticateExternal,
  Connection as ConnectionBase,
} from 'integreat'
import type { JobId, Queue, AdvancedSettings } from 'bull'

export interface RedisOptions {
  uri?: string
  host?: string
  port?: number
  tls?: boolean
  auth?: {
    key?: string
    secret?: string
  }
}

export interface EndpointOptions extends Record<string, unknown> {
  queue?: Queue
  queueId?: string
  subQueueId?: string
  maxConcurrency?: number
  redis?: string | RedisOptions
  keyPrefix?: string
  bullSettings?: AdvancedSettings
}

export interface Connection extends ConnectionBase {
  queue?: Queue
  queueId?: string
  subQueueId?: string
  maxConcurrency?: number
}

export interface Authentication extends Record<string, unknown> {
  key?: string
  secret?: string
}

export interface JobData {
  id: JobId
  timestamp: number
  queueId: string
}

export interface PromiseWithProgress<T> extends Promise<T> {
  onProgress?: (cb: (progress?: number) => void) => void
}

export interface QueueListener {
  dispatch: Dispatch | null
  authenticate: AuthenticateExternal | null
}

export interface ActiveQueue {
  queue: Queue
  listeners: Map<string, QueueListener>
  isListening: boolean
}
