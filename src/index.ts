import connect from './connect.js'
import disconnect from './disconnect.js'
import send from './send.js'
import listen from './listen.js'
import type { Transporter } from 'integreat'
import type { QueueListeners } from './types.js'

// We keep all listeners in a global Map to make sure we only create one
// listener for each queue. A listener will handle jobs from the queue itself
// and any sub queues.
const queueListeners: QueueListeners = new Map()

/**
 * Bull Queue Transporter for Integreat
 */
const bullTransporter: Transporter = {
  authentication: 'asObject',

  prepareOptions: (options, _serviceId) => options,

  connect,

  send,

  shouldListen: (options) => options.dontListen !== true,

  listen: listen(queueListeners),

  disconnect,
}

export default bullTransporter
