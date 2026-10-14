import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.js';

function withDir(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-'));
  if (contents !== null) writeFileSync(join(dir, 'config.json'), contents);
  return dir;
}

function withEnvKey(value, fn) {
  const previous = process.env.LINEAR_API_KEY;
  if (value === null) delete process.env.LINEAR_API_KEY;
  else process.env.LINEAR_API_KEY = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previous;
  }
}

test('loadConfig merges defaults and keeps the api key', () => {
  const dir = withDir('{"linearApiKey":"k"}');
  assert.deepEqual(loadConfig(dir), { issueLimit: 50, base: 'default', fzfLayout: 'down', showIssueDetails: false, worktreeLocation: 'repo', startOnCreate: false, linearApiKey: 'k' });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig honors overrides', () => {
  const dir = withDir('{"linearApiKey":"k","issueLimit":10,"base":"head","teamKey":"BIT"}');
  assert.deepEqual(loadConfig(dir), { issueLimit: 10, base: 'head', fzfLayout: 'down', showIssueDetails: false, worktreeLocation: 'repo', startOnCreate: false, linearApiKey: 'k', teamKey: 'BIT' });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig throws when linearApiKey is missing everywhere', () => {
  const dir = withDir('{"issueLimit":5}');
  withEnvKey(null, () => {
    assert.throws(() => loadConfig(dir), /set linearApiKey/);
    assert.throws(() => loadConfig(undefined), /LINEAR_API_KEY/);
  });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig falls back to LINEAR_API_KEY when config omits the key', () => {
  const dir = withDir('{"issueLimit":5}');
  withEnvKey('env-key', () => {
    assert.equal(loadConfig(dir).linearApiKey, 'env-key');
    assert.equal(loadConfig(undefined).linearApiKey, 'env-key');
  });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig prefers config.json over LINEAR_API_KEY', () => {
  const dir = withDir('{"linearApiKey":"file-key"}');
  withEnvKey('env-key', () => {
    assert.equal(loadConfig(dir).linearApiKey, 'file-key');
  });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig ignores an empty LINEAR_API_KEY', () => {
  const dir = withDir('{"issueLimit":5}');
  withEnvKey('', () => {
    assert.throws(() => loadConfig(dir), /set linearApiKey/);
  });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig throws on malformed JSON', () => {
  const dir = withDir('{bad');
  assert.throws(() => loadConfig(dir), /invalid config\.json/);
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig lets config.local.json override config.json and supply the api key', () => {
  const dir = withDir('{"issueLimit":10,"teamKey":"BIT"}');
  writeFileSync(join(dir, 'config.local.json'), '{"linearApiKey":"local-key","issueLimit":20}');
  const config = loadConfig(dir);
  assert.equal(config.linearApiKey, 'local-key');
  assert.equal(config.issueLimit, 20);
  assert.equal(config.teamKey, 'BIT');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig names config.local.json when it is invalid', () => {
  const dir = withDir('{"linearApiKey":"k"}');
  writeFileSync(join(dir, 'config.local.json'), '{oops');
  assert.throws(() => loadConfig(dir), /invalid config\.local\.json/);
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig rejects an unknown worktreeLocation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ linearApiKey: 'k', worktreeLocation: 'tmp' }));
  assert.throws(() => loadConfig(dir), /worktreeLocation/);
});
