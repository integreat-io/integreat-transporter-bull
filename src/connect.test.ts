import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import Bull from 'bull'
import disconnect from './disconnect.js'
import wait from './tests/helpers/wait.js'
import type { Connection, QueueObject } from './types.js'

import connect, { prepareRedisOptions } from './connect.js'

interface QueueWithInternals extends Bull.Queue {
  keyPrefix: string
  settings: {
    lockDuration: number
  }
}

// Setup

const emit = () => undefined
const queues = new Map<string, QueueObject>()

// Tests

test('should connect to bull queue with redis url and default prefix', async (t) => {
  const options = {
    queueId: 'ns1',
    redis: { host: 'localhost', port: 6379 },
  }

  const conn = await connect(queues)(options, null, null, emit)
  t.after(async () => {
    await disconnect(queues)(conn)
  })

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert.equal(conn?.queueId, 'ns1')
  assert(conn?.queue)
  assert.equal(conn?.queue?.name, 'ns1')
  assert.equal((conn?.queue as QueueWithInternals).keyPrefix, 'bull')
  assert.equal(conn?.queue?.client.options.host, 'localhost')
  assert.equal(conn?.queue?.client.options.port, 6379)
})

test('should reuse queue for same queueId', async (t) => {
  const options = {
    queueId: 'ns2',
    redis: { host: 'localhost', port: 6379 },
  }

  const conn1 = await connect(queues)(options, null, null, emit)
  const conn2 = await connect(queues)(options, null, null, emit)
  t.after(async () => {
    await disconnect(queues)(conn1)
    await disconnect(queues)(conn2)
  })

  assert(conn1?.queue)
  assert.equal(conn1?.queue, conn2?.queue)
})

test('should connect to bull queue with subQueueId', async (t) => {
  const options = {
    queueId: 'ns3',
    subQueueId: 'sub1',
    redis: { host: 'localhost', port: 6379 },
  }

  const conn = await connect(queues)(options, null, null, emit)
  t.after(async () => {
    await disconnect(queues)(conn)
  })

  assert(typeof conn === 'object' && conn !== null)
  assert.equal
  assert.equal(conn?.queueId, 'ns3')
  assert.equal(conn?.subQueueId, 'sub1')
  assert(conn?.queue)
  assert.equal(conn?.queue?.name, 'ns3')
  assert.equal((conn?.queue as QueueWithInternals).keyPrefix, 'bull')
  assert.equal(conn?.queue?.client.options.host, 'localhost')
  assert.equal(conn?.queue?.client.options.port, 6379)
})

test('should connect to bull queue with specified prefix', async (t) => {
  const options = {
    queueId: 'ns4',
    redis: { host: 'localhost', port: 6379 },
    keyPrefix: 'something',
  }

  const conn = await connect(queues)(options, null, null, emit)
  t.after(async () => {
    await disconnect(queues)(conn)
  })

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert.equal(conn?.queueId, 'ns4')
  assert(conn?.queue)
  assert.equal(conn?.queue?.name, 'ns4')
  assert.equal((conn?.queue as QueueWithInternals).keyPrefix, 'something')
  assert.equal(conn?.queue?.client.options.host, 'localhost')
  assert.equal(conn?.queue?.client.options.port, 6379)
})

test('should connect to bull queue with redis options', async (t) => {
  const options = {
    queueId: 'ns5',
    redis: { host: 'localhost', port: 6379 },
  }

  const conn = await connect(queues)(options, null, null, emit)
  t.after(async () => {
    await disconnect(queues)(conn)
  })

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert(conn?.queue)
  assert.equal(conn?.queue?.name, 'ns5')
  assert.equal(conn?.queue?.client.options.host, 'localhost')
  assert.equal(conn?.queue?.client.options.port, 6379)
})

test('should connect to bull queue without options', async () => {
  const options = { queueId: 'ns6' }

  const conn = await connect(queues)(options, null, null, emit)

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert(conn?.queue)
  assert.equal(conn?.queue?.name, 'ns6')
  assert.equal(conn?.queue?.client.options.host, '127.0.0.1')
  assert.equal(conn?.queue?.client.options.port, 6379)

  await disconnect(queues)(conn)
})

test('should use provided bull queue as is', async () => {
  const queue = new Bull('ns7_b') // Different queueId than options
  const options = { queueId: 'ns7', queue }

  const conn = await connect(queues)(options, null, null, emit)

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert(conn?.queue)
  assert.equal(conn?.queue?.name, 'ns7_b')

  await disconnect(queues)(conn)
})

test('should not reuse provided bull queue', async (t) => {
  const queue = new Bull('ns17_b') // Different queueId than options
  const options = {
    queueId: 'ns17',
    redis: { host: 'localhost', port: 6379 },
  }

  const conn1 = await connect(queues)({ ...options, queue }, null, null, emit) // Provide queue for the first connection
  const conn2 = await connect(queues)(options, null, null, emit) // .. and not for the second
  t.after(async () => {
    await disconnect(queues)(conn1)
    await disconnect(queues)(conn2)
  })

  assert(conn1?.queue)
  assert.notEqual(conn1?.queue, conn2?.queue)
})

test('should use default queueId when none is provided', async () => {
  const options = {}

  const conn = await connect(queues)(options, null, null, emit)

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert.equal(conn?.queueId, 'great')
  assert(conn?.queue)
  assert.equal(conn?.queue?.name, 'great')

  await disconnect(queues)(conn)
})

test('should pass on some options to connection object', async () => {
  const options = {
    queueId: 'ns8',
    subQueueId: 'internal',
    maxConcurrency: 5,
  }

  const conn = await connect(queues)(options, null, null, emit)

  assert.equal(conn?.status, 'ok')
  assert.equal(conn?.queueId, 'ns8')
  assert.equal(conn?.subQueueId, 'internal')
  assert.equal(conn?.maxConcurrency, 5)

  await disconnect(queues)(conn)
})

test('should pass on bull advanced settings object', async (t) => {
  const options = {
    queueId: 'ns9',
    redis: 'redis://localhost:6379',
    bullSettings: {
      lockDuration: 12345,
    },
  }

  const conn = await connect(queues)(options, null, null, emit)
  t.after(async () => {
    await disconnect(queues)(conn)
  })

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert(conn?.queue)
  assert.equal((conn?.queue as QueueWithInternals).settings.lockDuration, 12345)
})

test('should pass on auth object', async (t) => {
  const options = {
    queueId: 'ns10',
    redis: 'redis://localhost:6378',
  }
  const authentication = {
    status: 'granted',
    key: 'me',
    secret: 's3cr3t',
  }

  const conn = await connect(queues)(options, authentication, null, emit)
  t.after(async () => {
    await conn?.queue?.close() // We're closing "manually" as this connection will never be valid
  })

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert.equal(conn?.queueId, 'ns10')
  assert(conn?.queue)
  assert.equal(conn?.queue?.name, 'ns10')
  assert.equal(conn?.queue?.client.options.username, 'me')
  assert.equal(conn?.queue?.client.options.password, 's3cr3t')
})

test('should reuse connection if still connected', async (t) => {
  const options1 = { queueId: 'ns11' }
  const options2 = { queueId: 'ns12' }

  const conn1 = await connect(queues)(options1, null, null, emit)
  const conn2 = await connect(queues)(options2, null, conn1, emit)
  t.after(async () => {
    await disconnect(queues)(conn1)
    await disconnect(queues)(conn2)
  })

  assert(typeof conn2 === 'object' && conn2 !== null)
  assert.equal(conn2?.status, 'ok')
  assert.equal(conn2?.queueId, 'ns11')
})

test('should create new connection when given one is closed', async (t) => {
  const options1 = { queueId: 'ns13' }
  const options2 = { queueId: 'ns14' }

  const conn1 = await connect(queues)(options1, null, null, emit)
  const conn1Closed = {
    ...conn1,
    queue: {
      ...conn1?.queue,
      client: { ...conn1?.queue?.client, status: 'end' },
    },
  } as Connection
  const conn2 = await connect(queues)(options2, null, conn1Closed, emit)
  t.after(async () => {
    await disconnect(queues)(conn1)
    await disconnect(queues)(conn2)
  })

  assert(typeof conn2 === 'object' && conn2 !== null)
  assert.equal(conn2?.status, 'ok')
  assert.equal(conn2?.queueId, 'ns14')
})

test('should create new connection if given one has an error', async (t) => {
  const options = { queueId: 'ns15' }
  const connection = { status: 'error', error: 'What happened?' }

  const conn = await connect(queues)(options, null, connection, emit)
  t.after(async () => {
    await disconnect(queues)(conn)
  })

  assert(typeof conn === 'object' && conn !== null)
  assert.equal(conn?.status, 'ok')
  assert.equal(conn?.queueId, 'ns15')
})

test('should emit error from bull', async (t) => {
  const emit = sinon.stub()
  const options = {
    queueId: 'ns16',
    redis: 'http://unknown.test:9999',
  }

  const conn = await connect(queues)(options, null, null, emit)
  t.after(async () => {
    await conn?.queue?.close() // We're closing "manually" as this connection will never be valid
  })
  await wait(500)

  assert(emit.callCount > 1)
  assert.equal(emit.args[1][0], 'error')
  const err = emit.args[1][1] as Error
  assert.deepEqual(
    err.message,
    'Bull error: getaddrinfo ENOTFOUND unknown.test',
  )
})

// Tests -- redis options

test('should return redis options for an url string', () => {
  const options = 'redis://redis1.test:6380'
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    uri: 'redis://redis1.test:6380',
  }

  const ret = prepareRedisOptions(options)

  assert.deepEqual(ret, expected)
})

test('should return redis options from an object with uri', () => {
  const options = { uri: 'redis://redis1.test:6380' }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    uri: 'redis://redis1.test:6380',
  }

  const ret = prepareRedisOptions(options)

  assert.deepEqual(ret, expected)
})

test('should return redis options from individual params', () => {
  const options = {
    host: 'redis1.test',
    port: 6380,
    tls: false,
    auth: { key: 'johnf', secret: 's3cr3t' },
  }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    host: 'redis1.test',
    port: 6380,
    username: 'johnf',
    password: 's3cr3t',
  }

  const ret = prepareRedisOptions(options)

  assert.deepEqual(ret, expected)
})

test('should return redis options from individual params with tls', () => {
  const options = {
    host: 'redis1.test',
    port: 6380,
    tls: true,
    auth: { key: 'johnf', secret: 's3cr3t' },
  }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    host: 'redis1.test',
    port: 6380,
    username: 'johnf',
    password: 's3cr3t',
    tls: { host: 'redis1.test', port: 6380 },
  }

  const ret = prepareRedisOptions(options)

  assert.deepEqual(ret, expected)
})

test('should return redis options with auth', () => {
  const options = 'redis://redis1.test:6380'
  const auth = { key: 'reidun', secret: 'passord1' }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    uri: 'redis://redis1.test:6380',
    username: 'reidun',
    password: 'passord1',
  }

  const ret = prepareRedisOptions(options, auth)

  assert.deepEqual(ret, expected)
})

test('should return redis options with auth overriding the options key and secret', () => {
  const options = {
    host: 'redis1.test',
    port: 6380,
    tls: false,
    auth: { key: 'johnf', secret: 's3cr3t' },
  }
  const auth = { key: 'reidun', secret: 'passord1' }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    host: 'redis1.test',
    port: 6380,
    username: 'reidun',
    password: 'passord1',
  }

  const ret = prepareRedisOptions(options, auth)

  assert.deepEqual(ret, expected)
})
