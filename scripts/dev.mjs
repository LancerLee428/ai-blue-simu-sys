import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const children = new Map();
let shuttingDown = false;
const requiredPorts = [3000, 5173];

function canListenPort(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

async function assertPortsAvailable() {
  const busyPorts = [];

  for (const port of requiredPorts) {
    if (!(await canListenPort(port))) {
      busyPorts.push(port);
    }
  }

  if (busyPorts.length > 0) {
    process.stderr.write(
      `[dev] port ${busyPorts.join(', ')} already in use. Stop the old dev process first.\n`,
    );
    process.exit(1);
  }
}

function prefixOutput(name, stream) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.length > 0) {
        process.stdout.write(`[${name}] ${line}\n`);
      }
    }
  });
}

function start(name, args) {
  const child = spawn('npm', args, {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.set(name, child);
  prefixOutput(name, child.stdout);
  prefixOutput(name, child.stderr);

  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    process.stderr.write(`[dev] ${name} stopped with ${reason}; shutting down the rest.\n`);
    shutdown(code ?? 1);
  });

  return child;
}

function killProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      process.stderr.write(`[dev] failed to send ${signal} to pid ${child.pid}: ${error.message}\n`);
    }
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children.values()) {
    killProcessGroup(child, 'SIGTERM');
  }

  for (const child of children.values()) {
    killProcessGroup(child, 'SIGKILL');
  }

  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
process.on('SIGHUP', () => shutdown(129));

await assertPortsAvailable();
start('server', ['--workspace', '@ai-blue-simu-sys/server', 'run', 'dev']);
start('web', ['--workspace', '@ai-blue-simu-sys/web', 'run', 'dev']);
