module.exports = {
  environmentVariables: {
    TSIMP_DIAG: 'ignore',
    // DEBUG: 'integreat:transporter:bull',
  },
  extensions: { ts: 'module' },
  nodeArguments: ['--import=tsimp'],
  watchMode: {
    ignoreChanges: ['{coverage,dist,media,redisdata,.tsimp}/**', '**/*.md'],
  },
  files: ['src/**/*.test.ts'],
}
