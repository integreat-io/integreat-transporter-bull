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

test('should reuse queue for same namespace', async (t) => {
  const options = {
    namespace: 'ns2',
    redis: 'redis://redis2.test:6380',
    waitForReady: false,
  }

  const conn1 = await connect(options, null, null)
  const conn2 = await connect(options, null, null)

  t.truthy(conn1?.queue)
  t.is(conn1?.queue, conn2?.queue)
})

test('should connect to bull queue with sub namespace', async (t) => {
  const options = {
    namespace: 'ns3',
    subNamespace: 'sub1',
    redis: 'redis://redis3.test:6380',
    waitForReady: false,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns3')
  t.is(conn?.subNamespace, 'sub1')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns3')
  t.is((conn?.queue as QueueWithInternals).keyPrefix, 'bull')
  t.is(conn?.queue?.client.options.host, 'redis3.test')
  t.is(conn?.queue?.client.options.port, 6380)
})

test('should connect to bull queue with specified prefix', async (t) => {
  const options = {
    namespace: 'ns4',
    redis: 'redis://redis4.test:6380',
    keyPrefix: 'something',
    waitForReady: false,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns4')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns4')
  t.is((conn?.queue as QueueWithInternals).keyPrefix, 'something')
  t.is(conn?.queue?.client.options.host, 'redis4.test')
  t.is(conn?.queue?.client.options.port, 6380)
})

test('should connect to bull queue with redis options', async (t) => {
  const options = {
    namespace: 'ns5',
    redis: { host: 'redis5.test', port: 6382, waitForReady: false },
    waitForReady: false,
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns5')
  t.is(conn?.queue?.client.options.host, 'redis5.test')
  t.is(conn?.queue?.client.options.port, 6382)
})

test('should connect to bull queue without options', async (t) => {
  const options = { namespace: 'ns6', waitForReady: false }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns6')
  t.is(conn?.queue?.client.options.host, '127.0.0.1')
  t.is(conn?.queue?.client.options.port, 6379)
})

test('should use provided bull queue as is', async (t) => {
  const queue = new Bull('ns7_b') // Different namespace than options
  const options = { namespace: 'ns7', queue, waitForReady: false }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns7_b')
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
    namespace: 'ns8',
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
    namespace: 'ns9',
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
    namespace: 'ns10',
    redis: 'redis://localhost:6378',
    waitForReady: false,
  }
  const authentication = { username: 'me', password: 's3cr3t' }

  const conn = await connect(options, authentication, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns10')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns10')
  t.is(conn?.queue?.client.options.username, 'me')
  t.is(conn?.queue?.client.options.password, 's3cr3t')
})

test('should reuse connection if still connected', async (t) => {
  const options1 = { namespace: 'ns11', waitForReady: false }
  const options2 = { namespace: 'ns12', waitForReady: false }

  const conn1 = await connect(options1, null, null)
  const conn2 = await connect(options2, null, conn1)

  t.true(typeof conn2 === 'object' && conn2 !== null)
  t.is(conn2?.status, 'ok')
  t.is(conn2?.namespace, 'ns11')
})

test('should create new connection when given one is closed', async (t) => {
  const options1 = { namespace: 'ns13', waitForReady: false }
  const options2 = { namespace: 'ns14', waitForReady: false }

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
  t.is(conn2?.namespace, 'ns14')
})

test('should create new connection if given one has an error', async (t) => {
  const options = { namespace: 'ns15', waitForReady: false }
  const connection = { status: 'error', error: 'What happened?' }

  const conn = await connect(options, null, connection)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns15')
})

test('should return with an error when connection cannot be made', async (t) => {
  const options = {
    namespace: 'ns16',
    redis: 'redis://unknown.test:9999',
  }

  const conn = await connect(options, null, null)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'error')
  t.is(
    conn?.error,
    'Connection to Redis failed: getaddrinfo ENOTFOUND unknown.test'
  )
  t.is(conn?.namespace, 'ns16')
  t.falsy(conn?.queue)
})
