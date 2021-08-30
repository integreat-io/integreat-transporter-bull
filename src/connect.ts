import Bull = require('bull')
import debug = require('debug')
import { isObject } from './utils/is'
import {
  Connection,
  EndpointOptions,
  RedisOptions,
  Authentication,
} from './types'

const debugLog = debug('integreat:transporter:bull')

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
  namespace: string,
  redis?: string | RedisOptions | null,
  authentication?: Authentication | null,
  prefix = 'bull',
  settings = {}
) {
  const options = {
    redis: redisOptionsWithAuth(redis, authentication),
    prefix,
    settings,
  }
  return typeof redis === 'string'
    ? new Bull(namespace, redis, options)
    : new Bull(namespace, options)
}

// Relies on the internal `status` prop of Bull to be `'end'` when connection
// is closed. Is this the best we have?
const isDisconnected = (queue?: Bull.Queue) => queue?.client.status === 'end'

export default async function (
  {
    redis,
    namespace = 'great',
    queue: queueFromOptions,
    keyPrefix,
    bullSettings,
    maxConcurrency,
    waitForReady = true,
  }: EndpointOptions,
  authentication: Authentication | null,
  connection: Connection | null
): Promise<Connection | null> {
  if (
    isObject(connection) &&
    connection.status === 'ok' &&
    !isDisconnected(connection.queue)
  ) {
    debugLog(`Reusing bull queue '${connection.namespace}'`)
    return connection
  }

  const queue =
    queueFromOptions ??
    createQueue(namespace, redis, authentication, keyPrefix, bullSettings)
  debugLog(`Created bull queue '${namespace}'`)

  if (waitForReady) {
    try {
      debugLog(`Waiting for bull queue '${namespace} to be ready ...'`)
      await queue.isReady()
      debugLog(`Bull queue '${namespace} is ready'`)
    } catch (error) {
      debugLog(
        `Connection to bull queue '${namespace} failed. ${error.message}'`
      )
      return {
        status: 'error',
        error: `Connection to Redis failed: ${error.message}`,
        namespace,
      }
    }
  }

  return { status: 'ok', queue, namespace, maxConcurrency }
}
