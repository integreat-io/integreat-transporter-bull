import { JobId, Queue, AdvancedSettings } from 'bull'

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
  namespace?: string
  subNamespace?: string
  maxConcurrency?: number
  redis?: string | RedisOptions
  keyPrefix?: string
  bullSettings?: AdvancedSettings
  wrapSourceService?: string
  defaultIdentId?: string
}

export interface Ident {
  id?: string
  root?: boolean
  withToken?: string
  roles?: string[]
  tokens?: string[]
}

export type Params = Record<string, unknown>

export interface Paging {
  next?: Payload
  prev?: Payload
}

export interface Payload<T = unknown> extends Record<string, unknown> {
  type?: string | string[]
  id?: string | string[]
  data?: T
  sourceService?: string
  targetService?: string
  service?: string // For backward compability, may be removed
  endpoint?: string
  params?: Params
  uri?: string
  page?: number
  pageOffset?: number
  pageSize?: number
  pageAfter?: string
  pageBefore?: string
  pageId?: string
  sendNoDefaults?: boolean
}

export interface Meta extends Record<string, unknown> {
  id?: string
  cid?: string
  ident?: Ident
  queue?: boolean | number
  queuedAt?: number
  auth?: Record<string, unknown> | null
  options?: EndpointOptions
  authorized?: boolean
}

export interface Response<T = unknown> {
  status: string | null
  data?: T
  reason?: string
  error?: string
  warning?: string
  paging?: Paging
  params?: Params
  returnNoDefaults?: boolean
  responses?: Response[]
  access?: Record<string, unknown>
  meta?: Meta
}

export interface Action<P extends Payload = Payload, ResponseData = unknown> {
  type: string
  payload: P
  response?: Response<ResponseData>
  meta?: Meta
}

export interface Dispatch<T = unknown> {
  (action: Action | null): Promise<Response<T>>
}

export interface Connection extends Record<string, unknown> {
  status: string
  queue?: Queue
  namespace?: string
  subNamespace?: string
  maxConcurrency?: number
  wrapSourceService?: string
  defaultIdentId?: string
}

export interface Authentication extends Record<string, unknown> {
  key?: string
  secret?: string
}

export interface Transporter {
  authentication: string | null
  prepareOptions: (
    options: Record<string, unknown>,
    serviceId: string
  ) => Record<string, unknown>
  connect: (
    options: Record<string, unknown>,
    authentication: Authentication | null,
    connection: Connection | null,
    emit: (eventType: string, ...args: unknown[]) => void
  ) => Promise<Connection | null>
  send: (action: Action, connection: Connection | null) => Promise<Response>
  shouldListen?: (options: EndpointOptions) => boolean
  listen?: (
    dispatch: Dispatch,
    connection: Connection | null
  ) => Promise<Response>
  disconnect: (connection: Connection | null) => Promise<void>
}

export interface JobData {
  id: JobId
  timestamp: number
  namespace: string
}
