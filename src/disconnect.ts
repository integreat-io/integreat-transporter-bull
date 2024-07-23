import debug from 'debug'
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
  subQueueId?: string,
) {
  if (queueId) {
    const queueObj = queues.get(queueId)
    if (queueObj) {
      if (subQueueId) {
        const subHandlers = queueObj.subHandlers
        if (subHandlers) {
          const subObj = subHandlers.get(subQueueId)
          if (subObj) {
            subObj.dispatch = null
            subObj.authenticate = null
          }
          for (const handler of subHandlers.values()) {
            if (handler.dispatch) {
              // We've found another sub queue with a dispatch
              // handler, so return false to signal that we
              // cannot close yet
              countDown(queueObj) // But first count down
              return false
            }
          }
        }
      }

      // This is either a main queue or the last sub queue
      // Set the queue handlers to null and return true to
      // signal that we can stop -- as long as we have reached
      // the end of the connections count.
      const count = countDown(queueObj)
      if (count > 0) {
        return false
      } else {
        queueObj.dispatch = null
        queueObj.authenticate = null
      }
    }
  }
  return true
}

export default (queues: Map<string, QueueObject>) =>
  async function disconnect(connection: Connection | null): Promise<void> {
    if (!connection) {
      return
    }
    const { queueId, subQueueId, queue } = connection
    connection.queue = undefined
    connection.handlers = undefined

    const shouldClose = removeQueueAndHandlers(queues, queueId, subQueueId)
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
