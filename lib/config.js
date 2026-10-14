import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

const DEFAULTS = { issueLimit: 50, base: 'default', fzfLayout: 'down', showIssueDetails: false };

const KEYCHAIN_TIMEOUT_MS = 5000;

// macOS Keychain generic password for the current user, or undefined when the
// platform is not macOS, no service is configured, or the item cannot be read.
// The caller reports the missing key, so a failed lookup is not an error here.
function readKeychainKey(service) {
  if (process.platform !== 'darwin' || typeof service !== 'string' || !service) return undefined;
  try {
    const key = execFileSync('security', ['find-generic-password', '-a', userInfo().username, '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: KEYCHAIN_TIMEOUT_MS,
    }).trim();
    return key || undefined;
  } catch {
    return undefined;
  }
}

// Parsed JSON object from a file in the config dir; {} when the file does not exist.
function readJsonFile(configDir, name) {
  let text;
  try {
    text = readFileSync(join(configDir, name), 'utf8');
  } catch {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`worktree-from-linear: invalid ${name}: ${err.message}`);
  }
}

export function loadConfig(configDir) {
  // config.local.json overrides config.json; keep secrets there so config.json can be versioned.
  const parsed = configDir ? { ...readJsonFile(configDir, 'config.json'), ...readJsonFile(configDir, 'config.local.json') } : {};
  const config = { ...DEFAULTS, ...parsed };
  const linearApiKey = config.linearApiKey || process.env.LINEAR_API_KEY || readKeychainKey(config.linearApiKeychainService);
  if (typeof linearApiKey !== 'string' || !linearApiKey) {
    throw new Error(
      'worktree-from-linear: set linearApiKey in config.json, the LINEAR_API_KEY environment variable, or linearApiKeychainService (macOS Keychain item holding the Linear personal API key)'
    );
  }
  return { ...config, linearApiKey };
}
