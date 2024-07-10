import chalk from 'chalk'

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

function formatTestLine(name, ms, printDiv) {
  let line = `${name} ${chalk.grey(`(${formatMs(ms)})`)}\n`
  if (printDiv) {
    line = `---\n\n${line}`
  }
  return line
}

function lineFromEvent(event) {
  if (event.data.details.passed) {
    return event.data.skip
      ? `${chalk.yellow.bold('-')} ${event.data.name}`
      : `${chalk.green.bold('✓')} ${event.data.name}`
  } else {
    return `${chalk.red.bold('x')} ${event.data.name}`
  }
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
    `in file '${error.file}'\n`,
    formatCause(error.cause),
  ].join('\n')
}

const formatErrors = (errors) => errors.map(formatError).join('\n\n')

const isError = (event) =>
  !event.data.details.passed &&
  event.data.details.error.failureType === 'testCodeFailure'

const isFile = (event) => event.data.file.endsWith(event.data.name)
const isTodo = (event) => event.data.todo

export default async function* customReporter(source) {
  let summary = {}
  let errors = []
  let printDiv = false

  for await (const event of source) {
    switch (event.type) {
      case 'test:complete':
        if (!isFile(event) && !isTodo(event)) {
          const line = lineFromEvent(event)
          if (isError(event)) {
            errors.push(createError(event))
          }
          yield formatTestLine(line, event.data.details.duration_ms, printDiv)
          printDiv = false
        }
        break
      case 'test:plan':
        // yield '\r\x1b[K'
        yield '\n\n'
        break
      case 'test:diagnostic':
        if (addToSummary(event, summary)) {
          const line = [formatErrors(errors), formatSummary(summary)]
            .filter(Boolean)
            .join('\n\n')
          summary = {}
          errors = []
          printDiv = true
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
