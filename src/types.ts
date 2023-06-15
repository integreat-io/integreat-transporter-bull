import { Connection as ConnectionBase } from 'integreat'
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
