import debug from 'debug'
import type { Connection, QueueHandlers, QueueWithCount } from './types.js'

const debugLog = debug('integreat:transporter:bull')

function removeQueueHandlers(
  handlers: Map<string, QueueHandlers>,
  queueId: string,
  subQueueId?: string,
) {
  if (subQueueId) {
    const subHandlers = handlers.get(queueId)?.subHandlers
    if (subHandlers) {
      subHandlers.delete(subQueueId) // Remove our handler
      for (const handler of subHandlers.values()) {
        if (handler.dispatch) {
          // We've found another sub queue with a dispatch
          // handler, so return false to signal that we
          // cannot close yet
          return false
        }
      }
    }
  }

  // This is either a main queue or the last sub queue
  // Remove the queue handlers and return true to signal
  // that we can stop
  handlers.delete(queueId)
  return true
}

function removeQueue(queues: Map<string, QueueWithCount>, queueId: string) {
  const queueObj = queues.get(queueId)
  if (queueObj) {
    if (queueObj.count > 1) {
      return (queueObj.count -= 1)
    } else {
      queues.delete(queueId)
    }
  }
  return 0
}

function removeQueueAndHandlers(
  queues: Map<string, QueueWithCount>,
  handlers: Map<string, QueueHandlers>,
  queueId?: string,
  subQueueId?: string,
) {
  if (queueId) {
    const shouldClose = removeQueueHandlers(handlers, queueId, subQueueId)
    const connectionCount = removeQueue(queues, queueId)
    return shouldClose && connectionCount === 0
  }
  return true
}

export default (
  queues: Map<string, QueueWithCount>,
  handlers: Map<string, QueueHandlers>,
) =>
  async function disconnect(connection: Connection | null): Promise<void> {
    if (!connection) {
      return
    }
    const { queueId, subQueueId, queue } = connection
    connection.queue = undefined
    connection.handlers = undefined

    const shouldClose = removeQueueAndHandlers(
      queues,
      handlers,
      queueId,
      subQueueId,
    )
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
