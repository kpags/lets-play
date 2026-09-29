import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const viteCli = fileURLToPath(new URL('./node_modules/vite/bin/vite.js', import.meta.url))
const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, [viteCli, ...process.argv.slice(2)], { stdio: 'inherit' }),
]

function stop(exitCode = 0) {
  for (const child of children) child.kill()
  process.exit(exitCode)
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
children.forEach((child) => child.on('exit', (code) => {
  if (code && code !== 0) stop(code)
}))
