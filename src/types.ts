import {
  Authentication as AuthenticationBase,
  Connection as ConnectionBase,
} from 'integreat'
import type { JobId, Queue, AdvancedSettings } from 'bull'

export interface RedisOptions {
  port?: number
  host?: string
  family?: number
  path?: string
  keepAlive?: number
  connectionName?: string
  password?: string
  db?: number
  enableReadyCheck?: boolean
  keyPrefix?: string
  retryStrategy?(times: number): number | void | null
  maxRetriesPerRequest?: number | null
  reconnectOnError?(error: Error): boolean | 1 | 2
  enableOfflineQueue?: boolean
  connectTimeout?: number
  autoResubscribe?: boolean
  autoResendUnfulfilledCommands?: boolean
  lazyConnect?: boolean
  tls?: Record<string, unknown>
  sentinels?: Array<{ host: string; port: number }>
  name?: string
  readOnly?: boolean
  dropBufferSupport?: boolean
  showFriendlyErrorStack?: boolean
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

export interface Authentication extends AuthenticationBase {
  key?: string
  secret?: string
}

export interface JobData {
  id: JobId
  timestamp: number
  queueId: string
}
