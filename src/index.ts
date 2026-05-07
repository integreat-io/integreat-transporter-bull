import type { Transporter } from 'integreat'
import connect from './connect.js'
import disconnect from './disconnect.js'
import send from './send.js'
import listen from './listen.js'
import stopListening from './stopListening.js'
import type { QueueObject } from './types.js'

const queues = new Map<string, QueueObject>()

/**
 * Bull Queue Transporter for Integreat
 */
const bullTransporter: Transporter = {
  authentication: 'asObject',

  prepareOptions: (options, _serviceId) => options,

  connect: connect(queues),

  send,

  shouldListen: (options) => options.dontListen !== true,

  listen: listen(queues),

  stopListening,

  disconnect: disconnect(queues),
}

export default bullTransporter
