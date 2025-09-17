/* eslint-disable security/detect-object-injection */
import Bull, { QueueOptions } from 'bull'
import { RedisOptions as IORedisOptions } from 'ioredis'
import { ReconnectOnError } from 'ioredis/built/redis/RedisOptions.js'
import debug from 'debug'
import { isObject } from './utils/is.js'
import type {
  Connection,
  EndpointOptions,
  RedisOptions,
  Authentication,
  IoredisReconnectOnErrorStrategy,
} from './types.js'

const debugLog = debug('integreat:transporter:bull')

const queues: Record<string, Bull.Queue> = {}

const renameRedisOptions = ({
  uri,
  host,
  port,
  tls,
  auth: { key, secret } = {},
  connectTimeout,
  reconnectOnError,
}: RedisOptions) =>
  typeof uri === 'string'
    ? { uri }
    : {
        host,
        port,
        username: key,
        password: secret,
        ...(tls ? { tls: { host, port } } : {}),
        connectTimeout,
        reconnectOnError:
          reconnectOnError === undefined
            ? null
            : mapToReconnectOnError(reconnectOnError),
      }

const mapToReconnectOnError =
  (
    ioredisReconnectOnErrorStrategy: IoredisReconnectOnErrorStrategy,
  ): ReconnectOnError | null =>
  (error: Error): IoredisReconnectOnErrorStrategy => {
    debugLog(`Error from Redis: ${error}`)
    return ioredisReconnectOnErrorStrategy
  }

const generateRedisOptions = (redis?: RedisOptions | string | null) =>
  typeof redis === 'string'
    ? { uri: redis }
    : isObject(redis)
      ? renameRedisOptions(redis)
      : {}

export function prepareRedisOptions(
  redis?: RedisOptions | string | null,
  auth?: Authentication | null,
): IORedisOptions & { uri?: string } {
  const { key, secret } = auth || {}
  const options = generateRedisOptions(redis)

  return {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    ...options,
    ...(typeof key === 'string' ? { username: key } : {}),
    ...(typeof secret === 'string' ? { password: secret } : {}),
  }
}

function createQueue(
  queueId: string,
  redis?: string | RedisOptions | null,
  authentication?: Authentication | null,
  prefix = 'bull',
  settings = {},
) {
  const { uri, ...redisOptions } = prepareRedisOptions(redis, authentication)
  const options: QueueOptions = {
    redis: redisOptions,
    prefix,
    settings,
  }
  return typeof uri === 'string'
    ? new Bull(queueId, uri, options)
    : new Bull(queueId, options)
}

// Relies on the internal `status` prop of Bull to be `'end'` when connection
// is closed. Is this the best we have?
const isDisconnected = (queue?: Bull.Queue) => queue?.client.status === 'end'

export default async function connect(
  {
    redis,
    queueId = 'great',
    subQueueId,
    queue: queueFromOptions,
    keyPrefix,
    bullSettings,
    maxConcurrency,
  }: EndpointOptions,
  authentication: Record<string, unknown> | null,
  connection: Connection | null,
  emit: (eventType: string, ...args: unknown[]) => void,
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
      emit('error', new Error(`Bull error: ${error.message}`)),
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
