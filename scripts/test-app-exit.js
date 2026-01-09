/**
 * Test script for BluePLM App Exit Verification
 * 
 * This script verifies that:
 * 1. The app exits cleanly within 10 seconds of close
 * 2. The app can be relaunched immediately after exit
 * 3. Stale lock recovery works after forced kill
 * 
 * Usage: node scripts/test-app-exit.js [--kill-test] [--verbose]
 * 
 * Options:
 *   --kill-test  Also run the Task Manager kill recovery test
 *   --verbose    Show detailed output
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Configuration
const MAX_EXIT_WAIT_MS = 10000;  // 10 seconds max wait for clean exit
const LAUNCH_WAIT_MS = 3000;     // 3 seconds to detect if app started
const isWindows = process.platform === 'win32';
const APP_PATH = path.join(__dirname, '..', 'node_modules', '.bin', isWindows ? 'electron.cmd' : 'electron');
const MAIN_PATH = path.join(__dirname, '..', 'dist-electron', 'main.js');
const USERDATA_PATH = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const LOG_DIR = path.join(USERDATA_PATH, 'blue-plm', 'logs');
const LOCK_FILE_PATH = path.join(USERDATA_PATH, 'blue-plm', '.instance-lock');

// Parse args
const args = process.argv.slice(2);
const runKillTest = args.includes('--kill-test');
const verbose = args.includes('--verbose');

// Results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function logVerbose(msg) {
  if (verbose) {
    console.log(`       ${msg}`);
  }
}

function logResult(name, passed, details = '') {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`\n${status}: ${name}`);
  if (details) {
    console.log(`       ${details}`);
  }
  results.tests.push({ name, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

/**
 * Check if a process with given PID is running
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find BluePLM process PIDs
 */
function findBluePLMProcesses() {
  try {
    // Windows: use tasklist
    const output = execSync('tasklist /FI "IMAGENAME eq BluePLM.exe" /FO CSV /NH', { encoding: 'utf8' });
    const pids = [];
    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.includes('BluePLM.exe')) {
        const match = line.match(/"BluePLM\.exe","(\d+)"/);
        if (match) {
          pids.push(parseInt(match[1], 10));
        }
      }
    }
    return pids;
  } catch {
    // Also check for electron processes running our app
    try {
      const output = execSync('wmic process where "name=\'electron.exe\'" get processid,commandline /format:csv', { encoding: 'utf8' });
      const pids = [];
      const lines = output.trim().split('\n');
      for (const line of lines) {
        if (line.includes('blue-plm') || line.includes('bluePLM')) {
          const parts = line.split(',');
          const pid = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(pid)) {
            pids.push(pid);
          }
        }
      }
      return pids;
    } catch {
      return [];
    }
  }
}

/**
 * Kill all BluePLM processes forcefully
 */
function killAllBluePLMProcesses() {
  if (isWindows) {
    // On Windows, use taskkill with /T to kill process tree
    try {
      execSync('taskkill /F /IM BluePLM.exe /T 2>nul', { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      // Ignore
    }
    try {
      execSync('taskkill /F /IM electron.exe /T 2>nul', { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      // Ignore
    }
  } else {
    const pids = findBluePLMProcesses();
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
        logVerbose(`Killed process ${pid}`);
      } catch {
        // Ignore errors
      }
    }
  }
}

/**
 * Kill a specific process and its tree on Windows
 */
function killProcessTree(pid) {
  if (isWindows) {
    try {
      execSync(`taskkill /F /PID ${pid} /T 2>nul`, { encoding: 'utf8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  } else {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Wait for a process to exit
 */
function waitForProcessExit(pid, timeoutMs) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (!isProcessRunning(pid)) {
        clearInterval(checkInterval);
        resolve({ exited: true, elapsed: Date.now() - startTime });
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        resolve({ exited: false, elapsed: Date.now() - startTime });
      }
    }, 100);
  });
}

/**
 * Launch the app and return the process handle
 */
function launchApp(testMode = true) {
  const args = [MAIN_PATH];
  if (testMode) {
    args.push('--test-mode');
  }
  
  logVerbose(`Launching: ${APP_PATH} ${args.join(' ')}`);
  
  const child = spawn(APP_PATH, args, {
    detached: false,
    stdio: 'pipe',
    shell: isWindows,  // Required for .cmd files on Windows
    windowsHide: true, // Hide the console window on Windows
    env: {
      ...process.env,
      BLUEPLM_TEST: testMode ? '1' : '0'
    }
  });
  
  child.stdout?.on('data', (data) => {
    if (verbose) {
      process.stdout.write(`[APP] ${data}`);
    }
  });
  
  child.stderr?.on('data', (data) => {
    if (verbose) {
      process.stderr.write(`[APP ERR] ${data}`);
    }
  });
  
  return child;
}

/**
 * Get the most recent log file in the logs directory
 */
function getMostRecentLogFile() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      return null;
    }
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(LOG_DIR, f),
        mtime: fs.statSync(path.join(LOG_DIR, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    return files.length > 0 ? files[0].path : null;
  } catch {
    return null;
  }
}

/**
 * Read recent lines from the most recent log file
 */
function readRecentLogs(maxLines = 50) {
  try {
    const logPath = getMostRecentLogFile();
    if (!logPath) {
      return ['(No log files found)'];
    }
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n');
    logVerbose(`Reading from: ${logPath}`);
    return lines.slice(-maxLines);
  } catch (err) {
    return [`(Error reading logs: ${err.message})`];
  }
}

/**
 * Check if lock file exists
 */
function lockFileExists() {
  return fs.existsSync(LOCK_FILE_PATH);
}

/**
 * Get PID from lock file
 */
function getLockFilePid() {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      return parseInt(fs.readFileSync(LOCK_FILE_PATH, 'utf8').trim(), 10);
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Delete lock file
 */
function deleteLockFile() {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      fs.unlinkSync(LOCK_FILE_PATH);
      logVerbose('Deleted lock file');
    }
  } catch {
    // Ignore
  }
}

// ============================================
// Test Cases
// ============================================

/**
 * Test 1: Normal Exit - App exits cleanly within timeout
 */
async function testNormalExit() {
  log('Test 1: Normal Exit');
  log('  Launching app...');
  
  // Clean up any existing processes
  killAllBluePLMProcesses();
  deleteLockFile();
  await new Promise(r => setTimeout(r, 1000));
  
  const child = launchApp(true);
  const pid = child.pid;
  logVerbose(`App launched with PID: ${pid}`);
  
  // Wait for app to fully start
  await new Promise(r => setTimeout(r, LAUNCH_WAIT_MS));
  
  if (!isProcessRunning(pid)) {
    logResult('Normal Exit', false, 'App exited prematurely before test could run');
    return false;
  }
  
  log('  Sending SIGTERM to trigger clean exit...');
  const exitStartTime = Date.now();
  
  // Send SIGTERM to trigger clean exit
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    logResult('Normal Exit', false, `Failed to send SIGTERM: ${err.message}`);
    return false;
  }
  
  // Wait for exit
  const result = await waitForProcessExit(pid, MAX_EXIT_WAIT_MS);
  
  if (result.exited) {
    const withinLimit = result.elapsed < MAX_EXIT_WAIT_MS;
    logResult('Normal Exit', withinLimit, 
      `App exited in ${result.elapsed}ms (limit: ${MAX_EXIT_WAIT_MS}ms)`);
    
    // Check that lock file was cleaned up
    if (lockFileExists()) {
      log('  ⚠ Warning: Lock file still exists after exit');
    }
    
    return withinLimit;
  } else {
    logResult('Normal Exit', false, 
      `App did not exit within ${MAX_EXIT_WAIT_MS}ms - zombie process!`);
    
    // Force kill for cleanup
    killAllBluePLMProcesses();
    return false;
  }
}

/**
 * Test 2: Immediate Relaunch - Can launch again right after exit
 */
async function testImmediateRelaunch() {
  log('\nTest 2: Immediate Relaunch');
  
  // Ensure clean state
  killAllBluePLMProcesses();
  deleteLockFile();
  await new Promise(r => setTimeout(r, 500));
  
  log('  Launching first instance...');
  const child1 = launchApp(true);
  await new Promise(r => setTimeout(r, LAUNCH_WAIT_MS));
  
  if (!isProcessRunning(child1.pid)) {
    logResult('Immediate Relaunch', false, 'First instance failed to start');
    return false;
  }
  
  log('  Closing first instance...');
  process.kill(child1.pid, 'SIGTERM');
  
  // Wait for exit
  const exitResult = await waitForProcessExit(child1.pid, MAX_EXIT_WAIT_MS);
  
  if (!exitResult.exited) {
    logResult('Immediate Relaunch', false, 'First instance did not exit cleanly');
    killAllBluePLMProcesses();
    return false;
  }
  
  logVerbose(`First instance exited in ${exitResult.elapsed}ms`);
  
  // Immediately try to launch second instance
  log('  Launching second instance immediately...');
  const child2 = launchApp(true);
  await new Promise(r => setTimeout(r, LAUNCH_WAIT_MS));
  
  const secondStarted = isProcessRunning(child2.pid);
  
  // Cleanup
  if (secondStarted) {
    process.kill(child2.pid, 'SIGTERM');
    await waitForProcessExit(child2.pid, MAX_EXIT_WAIT_MS);
  }
  
  logResult('Immediate Relaunch', secondStarted,
    secondStarted ? 'Second instance launched successfully' : 'Second instance failed to start (lock held?)');
  
  killAllBluePLMProcesses();
  deleteLockFile();
  
  return secondStarted;
}

/**
 * Test 3: Stale Lock Recovery - Can launch after Task Manager kill
 */
async function testStaleLockRecovery() {
  log('\nTest 3: Stale Lock Recovery (simulated Task Manager kill)');
  
  // Ensure clean state
  killAllBluePLMProcesses();
  deleteLockFile();
  await new Promise(r => setTimeout(r, 500));
  
  log('  Launching app...');
  const child = launchApp(false); // No test mode to get real lock behavior
  await new Promise(r => setTimeout(r, LAUNCH_WAIT_MS));
  
  if (!isProcessRunning(child.pid)) {
    logResult('Stale Lock Recovery', false, 'App failed to start');
    return false;
  }
  
  const lockPid = getLockFilePid();
  logVerbose(`Lock file contains PID: ${lockPid}`);
  
  log('  Force-killing app (simulating Task Manager)...');
  killProcessTree(child.pid);
  
  // Wait a moment for process to die
  await new Promise(r => setTimeout(r, 500));
  
  // Verify process is dead but lock file exists (stale lock condition)
  const processStillRunning = isProcessRunning(child.pid);
  const lockExists = lockFileExists();
  
  logVerbose(`Process running: ${processStillRunning}, Lock exists: ${lockExists}`);
  
  if (processStillRunning) {
    logResult('Stale Lock Recovery', false, 'Process did not die from SIGKILL');
    killAllBluePLMProcesses();
    return false;
  }
  
  if (!lockExists) {
    logVerbose('Lock file was already cleaned up (this is actually fine)');
  }
  
  log('  Attempting to launch new instance (should recover from stale lock)...');
  const child2 = launchApp(false);
  await new Promise(r => setTimeout(r, LAUNCH_WAIT_MS));
  
  const recovered = isProcessRunning(child2.pid);
  
  // Cleanup
  if (recovered) {
    process.kill(child2.pid, 'SIGTERM');
    await waitForProcessExit(child2.pid, MAX_EXIT_WAIT_MS);
  }
  
  killAllBluePLMProcesses();
  deleteLockFile();
  
  logResult('Stale Lock Recovery', recovered,
    recovered ? 'New instance launched after stale lock recovery' : 'Failed to recover from stale lock');
  
  return recovered;
}

/**
 * Test 4: Fast Exit Verification
 * 
 * This test verifies that the app exits quickly and cleanly.
 * We consider a "fast exit" (< 200ms) as evidence of proper cleanup,
 * since slow exits indicate hanging resources.
 */
async function testCleanupLogs() {
  log('\nTest 4: Fast Exit Verification');
  
  // Clean up
  killAllBluePLMProcesses();
  deleteLockFile();
  await new Promise(r => setTimeout(r, 500));
  
  log('  Launching app...');
  
  // Capture stdout/stderr to check for any error messages
  const capturedOutput = [];
  
  const child = launchApp(true);
  
  // Capture output
  child.stdout?.on('data', (data) => {
    capturedOutput.push(data.toString());
    if (verbose) {
      process.stdout.write(`[APP] ${data}`);
    }
  });
  
  child.stderr?.on('data', (data) => {
    capturedOutput.push(data.toString());
    if (verbose) {
      process.stderr.write(`[APP ERR] ${data}`);
    }
  });
  
  await new Promise(r => setTimeout(r, LAUNCH_WAIT_MS));
  
  if (!isProcessRunning(child.pid)) {
    logResult('Fast Exit Verification', false, 'App failed to start');
    return false;
  }
  
  log('  Triggering clean exit...');
  const exitStartTime = Date.now();
  process.kill(child.pid, 'SIGTERM');
  const exitResult = await waitForProcessExit(child.pid, MAX_EXIT_WAIT_MS);
  
  // Wait for any remaining output
  await new Promise(r => setTimeout(r, 300));
  
  const allOutput = capturedOutput.join('');
  
  // Check that hard exit fallback was NOT triggered
  const hardExitTriggered = /Hard exit fallback triggered|HARD DEADLINE EXCEEDED/.test(allOutput);
  
  // A fast exit (< 200ms) indicates proper cleanup
  const isFastExit = exitResult.exited && exitResult.elapsed < 200;
  
  // Pass if: fast exit AND no hard exit triggered AND process actually exited
  const passed = exitResult.exited && isFastExit && !hardExitTriggered;
  
  let details = `Exit time: ${exitResult.elapsed}ms`;
  if (isFastExit) {
    details += ' (fast - cleanup working properly)';
  } else if (exitResult.exited) {
    details += ' (slower than expected)';
  } else {
    details += ' (TIMEOUT - process did not exit!)';
  }
  
  if (hardExitTriggered) {
    details += '\n       ⚠ Hard exit fallback was triggered';
  }
  
  logResult('Fast Exit Verification', passed, details);
  
  return passed;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       BluePLM App Exit Verification Test Suite              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Check prerequisites
  if (!fs.existsSync(MAIN_PATH)) {
    console.error(`ERROR: Built app not found at ${MAIN_PATH}`);
    console.error('Run "npm run dev" first to build the Electron main process.');
    process.exit(1);
  }
  
  log(`Lock file path: ${LOCK_FILE_PATH}`);
  log(`Log directory: ${LOG_DIR}`);
  log(`Max exit wait: ${MAX_EXIT_WAIT_MS}ms\n`);
  
  // Clean up before tests
  killAllBluePLMProcesses();
  deleteLockFile();
  await new Promise(r => setTimeout(r, 1000));
  
  // Run tests
  await testNormalExit();
  await new Promise(r => setTimeout(r, 1000));
  
  await testImmediateRelaunch();
  await new Promise(r => setTimeout(r, 1000));
  
  if (runKillTest) {
    await testStaleLockRecovery();
    await new Promise(r => setTimeout(r, 1000));
  } else {
    log('\nTest 3: Stale Lock Recovery - SKIPPED (use --kill-test to run)');
    results.tests.push({ name: 'Stale Lock Recovery', passed: null, details: 'Skipped' });
  }
  
  await testCleanupLogs();
  
  // Summary
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                         SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  
  for (const test of results.tests) {
    const status = test.passed === null ? '○ SKIP' : (test.passed ? '✓ PASS' : '✗ FAIL');
    console.log(`  ${status}  ${test.name}`);
  }
  
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  Total: ${results.passed} passed, ${results.failed} failed`);
  console.log('════════════════════════════════════════════════════════════\n');
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
