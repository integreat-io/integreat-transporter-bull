import { Connection } from './types'

export default async function disconnect(
  connection: Connection | null
): Promise<void> {
  if (connection?.queue) {
    await connection?.queue?.close()
  }
}
