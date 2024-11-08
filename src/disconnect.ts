import debug from 'debug'
import stopListening from './stopListening.js'
import type { Connection, QueueObject } from './types.js'

const debugLog = debug('integreat:transporter:bull')

function countDown(queueObj: QueueObject) {
  if (queueObj.count && queueObj.count > 1) {
    return (queueObj.count -= 1)
  } else {
    return 0
  }
}

function removeQueueAndHandlers(
  queues: Map<string, QueueObject>,
  queueId?: string,
) {
  const queueObj = queueId ? queues.get(queueId) : undefined
  if (!queueObj) {
    // We can't get the queue's object, so just close it
    return true
  }

  // Count down the number of connections for this queue
  const count = countDown(queueObj)
  if (count === 0) {
    queueObj.queue = undefined // Remove reference to queue when we are closing it
  }
  return count === 0 // Return true if we're the last connection, to signal that it's okay to close it
}

export default (queues: Map<string, QueueObject>) =>
  async function disconnect(connection: Connection | null): Promise<void> {
    if (!connection) {
      return
    }
    const stopResponse = await stopListening(connection)
    if (stopResponse.status !== 'ok') {
      // We only log this problem, as we would still like the connection to be closed
      debugLog(
        `Could not stop listening when disconnecting from queue. [${stopResponse.status}] ${stopResponse.error}`,
      )
    }
    const { queueId, queue } = connection
    connection.queue = undefined
    connection.handlers = undefined

    const shouldClose = removeQueueAndHandlers(queues, queueId)
    if (shouldClose && queue) {
      try {
        // We need some activity towards the queue to "force" bull to close correctly
        // The action will fail if e.g. the connection is already closed, and we'll
        // silently swallow the exception.
        await queue.getJobCounts()
      } catch {}
      await queue.close()
      debugLog(`Closed bull queue '${connection.queueId}'`)
    } else {
      debugLog(`Bull queue '${connection?.queueId}' is already closed`)
    }
  }
