import type { Response } from 'integreat'
import type { Connection, ActiveQueue } from './types.js'

export function removeListenerFromQueue(
  queues: Map<string, ActiveQueue>,
  queueId: string,
  subQueueId: string,
): Response | undefined {
  const listeners = queues.get(queueId)?.listeners
  if (!listeners) {
    return {
      status: 'noaction',
      warning: `Queue '${queueId}' is not connected`,
    }
  }
  if (!listeners.has(subQueueId)) {
    return {
      status: 'noaction',
      warning: `Queue '${queueId}' is not listening for sub queue '${subQueueId}'`,
    }
  }
  listeners.delete(subQueueId)
  return undefined
}

export default (queues: Map<string, ActiveQueue>) =>
  async function stopListening(
    connection: Connection | null,
  ): Promise<Response> {
    if (!connection) {
      return { status: 'noaction', warning: 'No connection' }
    }

    const { queueId, subQueueId = '*' } = connection
    if (typeof queueId === 'string') {
      const response = removeListenerFromQueue(queues, queueId, subQueueId)
      if (response) {
        return response
      }
    }

    return { status: 'ok' }
  }
