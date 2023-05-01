/* eslint-disable @typescript-eslint/no-non-null-assertion */
import test from 'ava'

import transporter from './index.js'

// Tests

test('should be a transporter', (t) => {
  t.is(typeof transporter.authentication, 'string')
  t.is(typeof transporter.prepareOptions, 'function')
  t.is(typeof transporter.connect, 'function')
  t.is(typeof transporter.send, 'function')
  t.is(typeof transporter.listen, 'function')
  t.is(typeof transporter.disconnect, 'function')
})

test('should have authentication string', (t) => {
  t.is(transporter.authentication, 'asObject')
})

// Tests -- prepareOptions

test('should return options object as is', (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://redis1.test:6380',
  }
  const serviceId = 'queue'

  const ret = transporter.prepareOptions(options, serviceId)

  t.deepEqual(ret, options)
})

// Tests -- shouldListen

test('should return true when options has no dontListen flag', (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://redis1.test:6380',
  }

  const ret = transporter.shouldListen!(options)

  t.true(ret)
})

test('should return false when dontListen flag is true', (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://redis1.test:6380',
    dontListen: true,
  }

  const ret = transporter.shouldListen!(options)

  t.false(ret)
})

test('should return true when dontListen flag is false', (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://redis1.test:6380',
    dontListen: false,
  }

  const ret = transporter.shouldListen!(options)

  t.true(ret)
})
