import test from 'node:test'
import assert from 'node:assert/strict'

import transporter from './index.js'

// Tests

test('should be a transporter', () => {
  assert.equal(typeof transporter.authentication, 'string')
  assert.equal(typeof transporter.prepareOptions, 'function')
  assert.equal(typeof transporter.connect, 'function')
  assert.equal(typeof transporter.send, 'function')
  assert.equal(typeof transporter.listen, 'function')
  assert.equal(typeof transporter.stopListening, 'function')
  assert.equal(typeof transporter.disconnect, 'function')
})

test('should have authentication string', () => {
  assert.equal(transporter.authentication, 'asObject')
})

// Tests -- prepareOptions

test('should return options object as is', () => {
  const options = {
    queueId: 'ns1',
    redis: 'redis://redis1.test:6380',
  }
  const serviceId = 'queue'

  const ret = transporter.prepareOptions(options, serviceId)

  assert.deepEqual(ret, options)
})

// Tests -- shouldListen

test('should return true when options has no dontListen flag', () => {
  const options = {
    queueId: 'ns1',
    redis: 'redis://redis1.test:6380',
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ret = transporter.shouldListen!(options)

  assert.equal(ret, true)
})

test('should return false when dontListen flag is true', () => {
  const options = {
    queueId: 'ns1',
    redis: 'redis://redis1.test:6380',
    dontListen: true,
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ret = transporter.shouldListen!(options)

  assert.equal(ret, false)
})

test('should return true when dontListen flag is false', () => {
  const options = {
    queueId: 'ns1',
    redis: 'redis://redis1.test:6380',
    dontListen: false,
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ret = transporter.shouldListen!(options)

  assert.equal(ret, true)
})
