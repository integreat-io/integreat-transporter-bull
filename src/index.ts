import connect from './connect.js'
import disconnect from './disconnect.js'
import type { EndpointOptions, Transporter } from './types.js'
import send from './send.js'
import listen from './listen.js'

/**
 * Bull Queue Transporter for Integreat
 */
const bullTransporter: Transporter = {
  authentication: 'asObject',

  prepareOptions: (options: EndpointOptions, _serviceId: string) => options,

  connect,

  send,

  shouldListen: (options) => options.dontListen !== true,

  listen,

  disconnect,
}

export default bullTransporter
