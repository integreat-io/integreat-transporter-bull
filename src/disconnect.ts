import debug from 'debug'
import type { Connection } from './types.js'

const debugLog = debug('integreat:transporter:bull')

export default async function disconnect(
  connection: Connection | null
): Promise<void> {
  if (connection?.queue) {
    await connection?.queue?.close()
    debugLog(`Closed bull queue '${connection.queueId}'`)
  } else {
    debugLog(`Bull queue '${connection?.queueId}' is already closed`)
  }
}
