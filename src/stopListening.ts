import type { Response } from 'integreat'
import type { Connection } from './types.js'

export default async function stopListening(
  connection: Connection | null,
): Promise<Response> {
  if (!connection) {
    return { status: 'noaction', error: 'No connection' }
  }

  if (connection.handlers) {
    connection.handlers.dispatch = null
    connection.handlers.authenticate = null
  }
  return { status: 'ok' }
}
