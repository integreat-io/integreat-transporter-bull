import type { Transporter } from 'integreat'
import connect from './connect.js'
import disconnect from './disconnect.js'
import send from './send.js'
import listen from './listen.js'

/**
 * Bull Queue Transporter for Integreat
 */
const bullTransporter: Transporter = {
  authentication: 'asObject',

  prepareOptions: (options, _serviceId) => options,

  connect,

  send,

  shouldListen: (options) => options.dontListen !== true,

  listen,

  disconnect,
}

export default bullTransporter
