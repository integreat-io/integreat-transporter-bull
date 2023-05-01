/* eslint-disable security/detect-object-injection */
import Bull from 'bull'
import debug from 'debug'
import { isObject } from './utils/is.js'
import type {
  Connection,
  EndpointOptions,
  RedisOptions,
  Authentication,
} from './types.js'

const debugLog = debug('integreat:transporter:bull')

const queues: Record<string, Bull.Queue> = {}

function redisOptionsWithAuth(
  redis?: RedisOptions | string | null,
  auth?: Authentication | null
): RedisOptions {
  const { username, password } = auth || {}
  return {
    ...(typeof redis === 'string' ? {} : redis),
    ...(typeof username === 'string' ? { username } : {}),
    ...(typeof password === 'string' ? { password } : {}),
  }
}

function createQueue(
  queueId: string,
  redis?: string | RedisOptions | null,
  authentication?: Authentication | null,
  prefix = 'bull',
  settings = {}
) {
  const options = {
    redis: redisOptionsWithAuth(redis, authentication),
    prefix,
    settings,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  }
  return typeof redis === 'string'
    ? new Bull(queueId, redis, options)
    : new Bull(queueId, options)
}

// Relies on the internal `status` prop of Bull to be `'end'` when connection
// is closed. Is this the best we have?
const isDisconnected = (queue?: Bull.Queue) => queue?.client.status === 'end'

export default async function (
  {
    redis,
    queueId = 'great',
    subQueueId,
    queue: queueFromOptions,
    keyPrefix,
    bullSettings,
    maxConcurrency,
  }: EndpointOptions,
  authentication: Authentication | null,
  connection: Connection | null,
  emit: (eventType: string, ...args: unknown[]) => void
): Promise<Connection | null> {
  if (
    isObject(connection) &&
    connection.status === 'ok' &&
    !isDisconnected(connection.queue)
  ) {
    debugLog(`Reusing bull queue '${connection.queueId}'`)
    return connection
  }

  let queue = queues[queueId] ?? queueFromOptions

  if (!queue) {
    queue = createQueue(queueId, redis, authentication, keyPrefix, bullSettings)
    debugLog(`Created bull queue '${queueId}'`)

    // Cache queue for reuse
    queues[queueId] = queue

    // Listen to errors from queue
    queue.on('error', (error) =>
      emit('error', new Error(`Bull error: ${error.message}`))
    )
  }

  return {
    status: 'ok',
    queue,
    queueId,
    subQueueId,
    maxConcurrency,
  }
}
