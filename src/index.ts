import type { Transporter } from 'integreat'
import connect from './connect.js'
import disconnect from './disconnect.js'
import send from './send.js'
import listen from './listen.js'
import stopListening from './stopListening.js'
import type { QueueHandlers, QueueWithCount } from './types.js'

const handlers = new Map<string, QueueHandlers>()
const queues = new Map<string, QueueWithCount>()

/**
 * Bull Queue Transporter for Integreat
 */
const bullTransporter: Transporter = {
  authentication: 'asObject',

  prepareOptions: (options, _serviceId) => options,

  connect: connect(queues),

  send,

  shouldListen: (options) => options.dontListen !== true,

  listen: listen(handlers),

  stopListening,

  disconnect: disconnect(queues, handlers),
}

export default bullTransporter
