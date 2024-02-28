import debug from 'debug'
import type { Connection, ActiveQueue } from './types.js'

const debugLog = debug('integreat:transporter:bull')

function removeListener(
  queues: Map<string, ActiveQueue>,
  queueId?: string,
  subQueueId?: string,
): boolean {
  if (typeof queueId === 'string') {
    const listeners = queues.get(queueId)?.listeners
    listeners?.delete(subQueueId || '*')
    if (listeners?.size === 0) {
      queues.delete(queueId)
      return true
    } else {
      return false
    }
  }
  return true
}

export default (queues: Map<string, ActiveQueue>) =>
  async function disconnect(connection: Connection | null): Promise<void> {
    if (connection) {
      const { queueId, subQueueId } = connection
      const isLastForQueue = removeListener(queues, queueId, subQueueId)

      if (connection.queue && isLastForQueue) {
        await connection.queue.close()
        connection.queue = undefined
        debugLog(`Closed bull queue '${connection.queueId}'`)
      } else {
        debugLog(`Bull queue '${connection?.queueId}' is already closed`)
      }
    }
  }
