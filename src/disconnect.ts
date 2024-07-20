import debug from 'debug'
import type { Connection } from './types.js'

const debugLog = debug('integreat:transporter:bull')

export default async function disconnect(
  connection: Connection | null,
): Promise<void> {
  const queue = connection?.queue
  if (queue) {
    await queue.pause(true) // Pause this worker before closing
    await queue.close()
    debugLog(`Closed bull queue '${connection.queueId}'`)
  } else {
    debugLog(`Bull queue '${connection?.queueId}' is already closed`)
  }
}
