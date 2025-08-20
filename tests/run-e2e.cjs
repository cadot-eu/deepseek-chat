const { exec } = require('child_process');
const http = require('http');
const { test } = require('playwright/test');

const SERVER_CMD = 'npm start';
const SERVER_URL = 'http://localhost:3000';
const TEST_CMD = 'npx playwright test tests/ui.spec.js';

function waitForServer(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      http.get(url, res => {
        if (res.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);
    }
    function retry() {
      if (Date.now() - start > timeout) return reject('Timeout serveur');
      setTimeout(check, 500);
    }
    check();
  });
}

async function run() {
  console.log('Démarrage du serveur...');
  const server = exec(SERVER_CMD.replace('run-e2e.js', 'run-e2e.cjs'));
  server.stdout.pipe(process.stdout);
  server.stderr.pipe(process.stderr);
  // Kill port 3000 before starting
  const { execSync } = require('child_process');
  try {
    execSync('fuser -k 3000/tcp');
  } catch (e) {
    // Ignore if nothing to kill
  }

  let killed = false;
  function killServer() {
    if (!killed) {
      server.kill();
      killed = true;
    }
  }
  process.on('SIGINT', killServer);
  process.on('SIGTERM', killServer);
  process.on('exit', killServer);
  try {
    await waitForServer(SERVER_URL);
    console.log('Serveur prêt, lancement du test UI...');
    exec(TEST_CMD, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      killServer();
      process.exit(err ? 1 : 0);
    });
  } catch (e) {
    console.error('Erreur serveur:', e);
    killServer();
    process.exit(1);
  }
}

run();
