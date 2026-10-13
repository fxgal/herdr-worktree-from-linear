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

export function loadConfig(configDir) {
  let parsed = {};
  if (configDir) {
    let text = null;
    try {
      text = readFileSync(join(configDir, 'config.json'), 'utf8');
    } catch {
      text = null;
    }
    if (text !== null) {
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(`worktree-from-linear: invalid config.json: ${err.message}`);
      }
    }
  }
  const config = { ...DEFAULTS, ...parsed };
  const linearApiKey = config.linearApiKey || process.env.LINEAR_API_KEY || readKeychainKey(config.linearApiKeychainService);
  if (typeof linearApiKey !== 'string' || !linearApiKey) {
    throw new Error(
      'worktree-from-linear: set linearApiKey in config.json, the LINEAR_API_KEY environment variable, or linearApiKeychainService (macOS Keychain item holding the Linear personal API key)'
    );
  }
  return { ...config, linearApiKey };
}
