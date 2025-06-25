import {
  Connection as ConnectionBase,
  Action,
  Response,
  AuthenticateExternal,
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
  eventListenersWarnLimit?: number
}

export interface PromiseWithProgress<T> extends Promise<T> {
  onProgress?: (cb: (progress?: number) => void) => void
}

export type DispatchWithProgress<T = unknown> = (
  action: Action | null,
) => PromiseWithProgress<Response<T>>

export interface HandlersObject {
  dispatch?: DispatchWithProgress | null
  authenticate?: AuthenticateExternal | null
}

export interface MainHandlersObject extends HandlersObject {
  subHandlers?: Map<string, HandlersObject>
}

export interface QueueObject extends MainHandlersObject {
  queue?: Queue
  count?: number
}

export interface Connection extends ConnectionBase {
  queue?: Queue
  queueId?: string
  subQueueId?: string
  maxConcurrency?: number
  handlers?: HandlersObject
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
