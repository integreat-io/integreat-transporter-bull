import test from 'ava'
import sinon from 'sinon'
import Bull from 'bull'
import type { Connection } from './types.js'

import connect from './connect.js'

interface QueueWithInternals extends Bull.Queue {
  keyPrefix: string
  settings: {
    lockDuration: number
  }
}

// Setup

const emit = () => undefined

const wait = (ms: number) =>
  new Promise((resolve, _reject) => {
    setInterval(resolve, ms)
  })

// Tests

test('should connect to bull queue with redis url and default prefix', async (t) => {
  const options = {
    namespace: 'ns1',
    redis: 'redis://redis1.test:6380',
  }

  const conn = await connect(options, null, null, emit)

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
  }

  const conn1 = await connect(options, null, null, emit)
  const conn2 = await connect(options, null, null, emit)

  t.truthy(conn1?.queue)
  t.is(conn1?.queue, conn2?.queue)
})

test('should connect to bull queue with sub namespace', async (t) => {
  const options = {
    namespace: 'ns3',
    subNamespace: 'sub1',
    redis: 'redis://redis3.test:6380',
  }

  const conn = await connect(options, null, null, emit)

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
  }

  const conn = await connect(options, null, null, emit)

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
    redis: { host: 'redis5.test', port: 6382 },
  }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns5')
  t.is(conn?.queue?.client.options.host, 'redis5.test')
  t.is(conn?.queue?.client.options.port, 6382)
})

test('should connect to bull queue without options', async (t) => {
  const options = { namespace: 'ns6' }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns6')
  t.is(conn?.queue?.client.options.host, '127.0.0.1')
  t.is(conn?.queue?.client.options.port, 6379)
})

test('should use provided bull queue as is', async (t) => {
  const queue = new Bull('ns7_b') // Different namespace than options
  const options = { namespace: 'ns7', queue }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns7_b')
})

test('should use default namespace when none is provided', async (t) => {
  const options = {}

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'great')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'great')
})

test('should pass on some options to connection object', async (t) => {
  const options = {
    namespace: 'ns8',
    subNamespace: 'internal',
    maxConcurrency: 5,
  }

  const conn = await connect(options, null, null, emit)

  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns8')
  t.is(conn?.subNamespace, 'internal')
  t.is(conn?.maxConcurrency, 5)
})

test('should pass on bull advanced settings object', async (t) => {
  const options = {
    namespace: 'ns9',
    redis: 'redis://localhost:6378',
    bullSettings: {
      lockDuration: 12345,
    },
  }
  const authentication = {
    status: 'granted',
    username: 'me',
    password: 's3cr3t',
  }

  const conn = await connect(options, authentication, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is((conn?.queue as QueueWithInternals).settings.lockDuration, 12345)
})

test('should pass on auth object', async (t) => {
  const options = {
    namespace: 'ns10',
    redis: 'redis://localhost:6378',
  }
  const authentication = {
    status: 'granted',
    username: 'me',
    password: 's3cr3t',
  }

  const conn = await connect(options, authentication, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns10')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns10')
  t.is(conn?.queue?.client.options.username, 'me')
  t.is(conn?.queue?.client.options.password, 's3cr3t')
})

test('should reuse connection if still connected', async (t) => {
  const options1 = { namespace: 'ns11' }
  const options2 = { namespace: 'ns12' }

  const conn1 = await connect(options1, null, null, emit)
  const conn2 = await connect(options2, null, conn1, emit)

  t.true(typeof conn2 === 'object' && conn2 !== null)
  t.is(conn2?.status, 'ok')
  t.is(conn2?.namespace, 'ns11')
})

test('should create new connection when given one is closed', async (t) => {
  const options1 = { namespace: 'ns13' }
  const options2 = { namespace: 'ns14' }

  const conn1 = await connect(options1, null, null, emit)
  const conn1Closed = {
    ...conn1,
    queue: {
      ...conn1?.queue,
      client: { ...conn1?.queue?.client, status: 'end' },
    },
  } as Connection
  const conn2 = await connect(options2, null, conn1Closed, emit)

  t.true(typeof conn2 === 'object' && conn2 !== null)
  t.is(conn2?.status, 'ok')
  t.is(conn2?.namespace, 'ns14')
})

test('should create new connection if given one has an error', async (t) => {
  const options = { namespace: 'ns15' }
  const connection = { status: 'error', error: 'What happened?' }

  const conn = await connect(options, null, connection, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.namespace, 'ns15')
})

test('should emit error from bull', async (t) => {
  const emit = sinon.stub()
  const options = {
    namespace: 'ns16',
    redis: 'http://unknown.test:9999',
  }

  await connect(options, null, null, emit)
  await wait(500)

  t.true(emit.callCount > 0)
  t.is(emit.args[1][0], 'error')
  const err = emit.args[1][1] as Error
  t.deepEqual(err.message, 'Bull error: getaddrinfo ENOTFOUND unknown.test')
})
