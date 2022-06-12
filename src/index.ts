import connect from './connect'
import disconnect from './disconnect'
import { EndpointOptions, Transporter } from './types'
import send from './send'
import listen from './listen'

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
