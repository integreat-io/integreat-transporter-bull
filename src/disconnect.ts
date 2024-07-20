import debug from 'debug'
import type { Connection } from './types.js'

const debugLog = debug('integreat:transporter:bull')

export default async function disconnect(
  connection: Connection | null,
): Promise<void> {
  const queue = connection?.queue
  if (queue) {
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
