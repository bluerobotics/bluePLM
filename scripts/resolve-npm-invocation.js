const installArguments = ['install', '--ignore-scripts']

function resolveNpmInvocation(platform = process.platform, environment = process.env) {
  if (platform !== 'win32') {
    return { command: 'npm', args: installArguments }
  }

  return {
    command: environment.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm.cmd', ...installArguments],
  }
}

module.exports = { resolveNpmInvocation }
