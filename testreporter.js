import chalk from 'chalk'
import ora from 'ora'

function formatMs(ms) {
  if (ms > 1000) {
    return `${Math.round(ms / 100) / 10}s`
  } else {
    return `${Math.round(ms * 10) / 10}ms`
  }
}

function formatSummary(summary) {
  return [
    chalk.white(
      `Ran ${summary.tests} tests${summary.suites ? ` in ${summary.suites} suites` : ''} ${chalk.grey(`(${formatMs(summary.duration_ms)})`)}`,
    ),
    chalk.green(`  ${summary.pass} passed`),
    summary.fail > 0 ? chalk.red(`  ${summary.fail} failed`) : undefined,
    summary.cancelled > 0
      ? chalk.red(
          `  ${summary.cancelled} ${summary.cancelled === 1 ? 'was' : 'were'} cancelled`,
        )
      : undefined,
    summary.skipped > 0
      ? chalk.yellow(
          `  ${summary.skipped} ${summary.skipped === 1 ? 'was' : 'were'} skipped`,
        )
      : undefined,
    summary.todo > 0 ? chalk.grey(`  ${summary.todo} todo`) : undefined,
    '\n',
  ]
    .filter(Boolean)
    .join('\n')
}

function addToSummary(event, summary) {
  const message = event.data.message
  const parts = message.split(' ')
  const type = parts[0]
  const count = parts[1]
  // eslint-disable-next-line security/detect-object-injection
  summary[type] = Number.parseInt(count)
  return type === 'duration_ms'
}

function formatTestLine(name, ms, isNewRun) {
  const line = `${name} ${chalk.grey(`(${formatMs(ms)})`)}\n`
  const prefix = isNewRun ? '' : '\r\x1b[K'
  return prefix + line
}

function lineFromEvent(event) {
  return event.data.skip
    ? `${chalk.yellow.bold('-')} ${event.data.name}`
    : `${chalk.green.bold('✓')} ${event.data.name}`
}
function lineFromFailed(event) {
  return `${chalk.red.bold('x')} ${event.data.name}`
}

const getCause = (cause) =>
  typeof cause === 'string'
    ? cause
    : cause instanceof Error
      ? cause.message
      : 'Unknown'

const createError = (event) => ({
  name: event.data.name,
  file: event.data.file,
  line: event.data.line,
  column: event.data.column,
  type: event.data.details.error.failureType,
  cause: getCause(event.data.details.error.cause),
})

const ensureEndingLineshift = (str) => (str.endsWith('\n') ? str : `${str}\n`)

function formatCauseLine(line) {
  if (line.startsWith('+ actual')) {
    return line
      .replace(
        '+ actual - expected',
        `${chalk.green('+')} expected ${chalk.red('-')} actual`,
      )
      .replace('...', chalk.grey('…'))
  } else if (line.startsWith('+')) {
    return `${chalk.red('-')}${line.slice(1)} `
  } else if (line.startsWith('-')) {
    return `${chalk.green('+')}${line.slice(1)} `
  } else if (line === '...') {
    return chalk.grey('…')
  } else {
    return line
  }
}

function formatCause(cause) {
  const line = cause.split('\n').map(formatCauseLine).join('\n')
  return ensureEndingLineshift(line)
}

function formatError(error) {
  return [
    chalk.red.bold(`Test '${error.name}' failed: `),
    `in file '${error.file}', line ${error.line}, column ${error.column}\n`,
    formatCause(error.cause),
  ].join('\n')
}

const formatErrors = (errors) => errors.map(formatError).join('\n\n')

const isFile = (event) => event.data.file.endsWith(event.data.name)
const isTodo = (event) => event.data.todo

const formatTestStatus = (status) =>
  [
    `${chalk.yellow(`Started ${status.running} tests.`)}`,
    status.passed ? `${chalk.green(`${status.passed} passed`)}.` : undefined,
    status.failed ? `${chalk.red(`${status.failed} failed`)}.` : undefined,
  ]
    .filter(Boolean)
    .join(' ')

function clearStatus(status = {}) {
  status.running = 0
  status.passed = 0
  status.failed = 0
  return status
}

export default async function* customReporter(source) {
  let summary = {}
  let errors = []
  let isRunComplete = false
  const status = clearStatus()
  let spinner = ora()

  for await (const event of source) {
    switch (event.type) {
      case 'test:enqueue':
        if (!isFile(event) && !isTodo(event)) {
          status.running++
          if (isRunComplete) {
            isRunComplete = false
            console.log('---\n')
          }
          spinner.start(formatTestStatus(status))
        }
        break
      case 'test:pass':
        if (!isFile(event) && !isTodo(event)) {
          status.passed++
          const line = lineFromEvent(event)
          yield formatTestLine(
            line,
            event.data.details.duration_ms,
            isRunComplete,
          )
          spinner.start(formatTestStatus(status))
        }
        isRunComplete = false
        break
      case 'test:fail':
        if (!isFile(event) && !isTodo(event)) {
          status.failed++
          errors.push(createError(event))
          const line = lineFromFailed(event)
          yield formatTestLine(
            line,
            event.data.details.duration_ms,
            isRunComplete,
          )
          spinner.start(formatTestStatus(status))
        }
        isRunComplete = false
        break
      case 'test:plan':
        spinner.stop()
        break
      case 'test:diagnostic':
        if (addToSummary(event, summary)) {
          const line = [' ', formatErrors(errors), formatSummary(summary)]
            .filter(Boolean)
            .join('\n\n')

          summary = {}
          errors = []
          isRunComplete = true
          clearStatus(status)

          yield line
        }
        break
      case 'test:stderr':
        yield chalk.red(`${event.data.message} \n`)
        break
      case 'test:stdout':
        yield chalk.white(`${event.data.message} \n`)
        break
      case 'test:coverage':
        const { totalLineCount } = event.data.summary.totals
        yield `total line count: ${totalLineCount} \n`
        break
      // default:
      //   console.log(event)
    }
  }
}
