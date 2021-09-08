import test from 'ava'
// import sinon = require('sinon')
import Bull = require('bull')
import { Connection } from './types'

import connect from './connect'

interface QueueWithInternals extends Bull.Queue {
  keyPrefix: string
  settings: {
    lockDuration: number
  }
}

// Tests

test('should connect to bull queue with redis url and default prefix', async (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://redis1.test:6380',
    waitForReady: false,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns1')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns1')
  t.is((conn?.queue as QueueWithInternals).keyPrefix, 'bull')
  t.is(conn?.queue?.client.options.host, 'redis1.test')
  t.is(conn?.queue?.client.options.port, 6380)
})

test('should connect to bull queue with specified prefix', async (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://redis1.test:6380',
    keyPrefix: 'something',
    waitForReady: false,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns1')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns1')
  t.is((conn?.queue as QueueWithInternals).keyPrefix, 'something')
  t.is(conn?.queue?.client.options.host, 'redis1.test')
  t.is(conn?.queue?.client.options.port, 6380)
})

test('should connect to bull queue with redis options', async (t) => {
  const options = {
    namespace: 'ns1',
    redis: { host: 'redis2.test', port: 6382, waitForReady: false },
    waitForReady: false,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns1')
  t.is(conn?.queue?.client.options.host, 'redis2.test')
  t.is(conn?.queue?.client.options.port, 6382)
})

test('should connect to bull queue without options', async (t) => {
  const options = { namespace: 'ns1', waitForReady: false }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns1')
  t.is(conn?.queue?.client.options.host, '127.0.0.1')
  t.is(conn?.queue?.client.options.port, 6379)
})

test('should use provided bull queue as is', async (t) => {
  const queue = new Bull('ns2') // Different namespace than options
  const options = { namespace: 'ns1', queue, waitForReady: false }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns2')
})

test('should use default namespace when none is provided', async (t) => {
  const options = { waitForReady: false }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'great')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'great')
})

test('should pass on some options to connection object', async (t) => {
  const options = {
    namespace: 'ns1',
    maxConcurrency: 5,
    waitForReady: false,
    wrapSourceService: 'queue',
    defaultIdentId: 'queuer',
  }

  const conn = await connect(options, null, null)

  t.is(conn?.status, 'ok')
  t.is(conn?.maxConcurrency, 5)
  t.is(conn?.wrapSourceService, 'queue')
  t.is(conn?.defaultIdentId, 'queuer')
  t.is(conn?.waitForReady, undefined)
})

test('should pass on bull advanced settings object', async (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://localhost:6378',
    bullSettings: {
      lockDuration: 12345,
    },
    waitForReady: false,
  }
  const authentication = { username: 'me', password: 's3cr3t' }

  const conn = await connect(options, authentication, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is((conn?.queue as QueueWithInternals).settings.lockDuration, 12345)
})

test('should pass on auth object', async (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://localhost:6378',
    waitForReady: false,
  }
  const authentication = { username: 'me', password: 's3cr3t' }

  const conn = await connect(options, authentication, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns1')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns1')
  t.is(conn?.queue?.client.options.username, 'me')
  t.is(conn?.queue?.client.options.password, 's3cr3t')
})

test('should reuse connection if still connected', async (t) => {
  const options1 = { namespace: 'ns1', waitForReady: false }
  const options2 = { namespace: 'ns2', waitForReady: false }

  const conn1 = await connect(options1, null, null)
  const conn2 = await connect(options2, null, conn1)

  t.true(typeof conn2 === 'object' && conn2 !== null)
  t.is(conn2?.status, 'ok')
  t.is(conn2?.namespace, 'ns1')
})

test('should create new connection when given one is closed', async (t) => {
  const options1 = { namespace: 'ns1', waitForReady: false }
  const options2 = { namespace: 'ns2', waitForReady: false }

  const conn1 = await connect(options1, null, null)
  const conn1Closed = {
    ...conn1,
    queue: {
      ...conn1?.queue,
      client: { ...conn1?.queue?.client, status: 'end' },
    },
  } as Connection
  const conn2 = await connect(options2, null, conn1Closed)

  t.true(typeof conn2 === 'object' && conn2 !== null)
  t.is(conn2?.status, 'ok')
  t.is(conn2?.namespace, 'ns2')
})

test('should create new connection if given one has an error', async (t) => {
  const options = { namespace: 'ns1', waitForReady: false }
  const connection = { status: 'error', error: 'What happened?' }

  const conn = await connect(options, null, connection)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns1')
})

test('should return with an error when connection cannot be made', async (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://unknown.test:9999',
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'error')
  t.is(
    conn?.error,
    'Connection to Redis failed: getaddrinfo ENOTFOUND unknown.test'
  )
  t.is(conn?.namespace, 'ns1')
  t.falsy(conn?.queue)
})
