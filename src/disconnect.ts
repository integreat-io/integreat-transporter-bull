import debug = require('debug')
import { Connection } from './types'

const debugLog = debug('integreat:transporter:bull')

export default async function disconnect(
  connection: Connection | null
): Promise<void> {
  if (connection?.queue) {
    await connection?.queue?.close()
    debugLog(`Closed bull queue '${connection.namespace}'`)
  } else {
    debugLog(`Bull queue '${connection?.namespace}' is already closed`)
  }
}
