import debug from 'debug'
import { removeListenerFromQueue } from './stopListening.js'
import type { Connection, ActiveQueue } from './types.js'

const debugLog = debug('integreat:transporter:bull')

export default (queues: Map<string, ActiveQueue>) =>
  async function disconnect(connection: Connection | null): Promise<void> {
    if (connection) {
      const { queueId, subQueueId = '*' } = connection
      let isLastListener = false
      if (typeof queueId === 'string') {
        removeListenerFromQueue(queues, queueId, subQueueId)
        const queue = queues.get(queueId)
        isLastListener = !queue || queue.listeners.size === 0
        if (queue && isLastListener) {
          queues.delete(queueId)
        }
      }

      if (connection.queue && isLastListener) {
        await connection.queue.close()
        connection.queue = undefined
        debugLog(`Closed bull queue '${connection.queueId}'`)
      } else {
        debugLog(`Bull queue '${connection?.queueId}' is already closed`)
      }
    }
  }
