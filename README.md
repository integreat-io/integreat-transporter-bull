# Bull Queue Transporter for Integreat (Redis backed queue)

This implementation is based on [Bull](https://github.com/OptimalBits/bull).

[![npm Version](https://img.shields.io/npm/v/integreat-transporter-bull.svg)](https://www.npmjs.com/package/integreat-transporter-bull)
[![Maintainability](https://api.codeclimate.com/v1/badges/1d4b81103596d082db28/maintainability)](https://codeclimate.com/github/integreat-io/integreat-transporter-bull/maintainability)

## Getting started

### Prerequisits

Requires node v18 and Integreat v1.0.

### Installing and using

Install from npm:

```
npm install integreat-transporter-bull
```

Example of use:

```javascript
import Integreat from 'integreat'
import bullTransporter from 'integreat-transport-bull'
import defs from './config'

const great = Integreat.create(defs, {
  transporters: { bull: bullTransporter() },
})

// ... and then dispatch actions as usual
```

Example source configuration:

```javascript
{
  id: 'store',
  transporter: 'bull',
  auth: true,
  endpoints: [
    {
      options: {
        queueId: 'bull-queue',
        maxConcurrency: 5,
      }
    }
  ]
}
```

**Note:** In the example above, `auth` is set to `true`, to let Integreat know
we don't require any authenticaton for this service. This is the correct way to
do it when you have a Redis database without authentication or when you include
the password in the url (this is not recommended, although it is a normal
convention for Redis). You may, however, pass a Redis username and/or password
through an authenticator set on the `auth` prop of the service defintion. The
expected props are `key` for the username and `secret` for the password. You may
also specify the username and password on the options object (see below).

Available properties for the `options` object:

- `queue`: An existing bull queue object to reuse instead of having the
  transporter create its own
- `queueId`: The queue id for the bull queue. Default is `great`
- `subQueueId`: Bull support different job types in the same queue. By setting
  `subQueueId`, jobs will be pushed to the queue with this string as job type,
  and in effect creating a "sub-queue". When you don't specify subQueueId`, the
  default job type will be used.
- `maxConcurrency`: Specifies how many parallell jobs Integreat may pick from
  the queue. Default is `1`.
- `redis`: A redis connection url or an object with the properties listed below.
- `keyPrefix`: When this is set, all Redis keys will be prefixed with this
  string. Default prefix is `bull`
- `bullSettings`: Advanced settings passed directly to bull. See
  [the AdvancedSettings object](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queue)
  in the bull documentation.

The available properties for the `redis` options object are as follow:

- `uri`: The entire URL of Redis database
- `host`: The Redis server hostname, default is `localhost`
- `port`: The Redis server port, default is `6379`
- `auth`: The Redis username as `key` and Redis password as `secret`
- `tls`: Set to `true` to enable TLS. Default is `false`

You may choose to set the `uri` or specify the individual properties.

### Debugging

Run Integreat with env variable `DEBUG=integreat:transporter:bull`, to receive
debug messages.

### Running the tests

The tests can be run with `npm test`.

## Contributing

Please read
[CONTRIBUTING](https://github.com/integreat-io/integreat-transporter-bull/blob/master/CONTRIBUTING.md)
for details on our code of conduct, and the process for submitting pull
requests.

## License

This project is licensed under the ISC License - see the
[LICENSE](https://github.com/integreat-io/integreat-transporter-bull/blob/master/LICENSE)
file for details.
