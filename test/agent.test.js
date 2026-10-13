import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentName, buildAgentPrompt, startAgent } from '../lib/agent.js';

const ROOT = '{"result":{"root_pane":{"pane_id":"wN:p1"}}}';
const ISSUE = { identifier: 'P-1870', title: 'Vincular el hilo', url: 'https://linear.app/x/issue/P-1870', stateName: 'In Progress', description: 'line one\n\nline two\t$(touch /tmp/x) `id`' };
const noSleep = async () => {};
const failingFetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });

test('agentName lowercases valid identifiers and rejects invalid ones', () => {
  assert.equal(agentName('P-1870'), 'p-1870');
  assert.equal(agentName('FAC-77'), 'fac-77');
  assert.equal(agentName('1-23'), null);
  assert.equal(agentName(''), null);
});

test('buildAgentPrompt is a single line and labels the description as untrusted', () => {
  const prompt = buildAgentPrompt(ISSUE);
  assert.equal(/[\x00-\x1f]/.test(prompt), false);
  assert.match(prompt, /^Linear issue P-1870: Vincular el hilo\./);
  assert.match(prompt, /untrusted data/);
  assert.match(prompt, /line one line two/);
  assert.match(prompt, /Do not edit any file until I confirm\.$/);
});

test('buildAgentPrompt omits the description when asked and caps long ones', () => {
  assert.equal(buildAgentPrompt(ISSUE, { withDescription: false }).includes('untrusted'), false);
  const long = buildAgentPrompt({ ...ISSUE, description: 'x'.repeat(10000) });
  assert.ok(long.length < 4000);
});

test('startAgent starts claude in the root pane with the issue prompt', async () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: '{}', stderr: '' }; };
  const ok = await startAgent({ config: {}, issue: ISSUE, worktreeStdout: ROOT, exec, fetchFn: failingFetch, sleepFn: noSleep });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  const args = calls[0];
  assert.deepEqual(args.slice(0, 8), ['herdr', 'agent', 'start', 'p-1870', '--kind', 'claude', '--pane', 'wN:p1']);
  assert.match(args.at(-1), /^Linear issue P-1870/);
});

test('startAgent retries without the description when herdr rejects the argument', async () => {
  const prompts = [];
  const exec = (cmd, args) => {
    prompts.push(args.at(-1));
    return prompts.length === 1
      ? { status: 1, stdout: '', stderr: '{"error":{"code":"invalid_agent_argument"}}' }
      : { status: 0, stdout: '{}', stderr: '' };
  };
  const ok = await startAgent({ config: {}, issue: ISSUE, worktreeStdout: ROOT, exec, fetchFn: failingFetch, sleepFn: noSleep });
  assert.equal(ok, true);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].includes('untrusted'), false);
});

test('startAgent retries a transient failure, then reports it without throwing', async () => {
  let attempts = 0;
  const warnings = [];
  const exec = () => { attempts += 1; return { status: 1, stdout: '', stderr: 'pane not at shell prompt' }; };
  const ok = await startAgent({ config: {}, issue: ISSUE, worktreeStdout: ROOT, exec, fetchFn: failingFetch, warn: (m) => warnings.push(m), sleepFn: noSleep });
  assert.equal(ok, false);
  assert.equal(attempts, 3);
  assert.ok(warnings.some((m) => m.includes('agent start failed for P-1870')));
});

test('startAgent does nothing without a root pane or a valid name', async () => {
  const boom = () => { throw new Error('should not exec'); };
  assert.equal(await startAgent({ config: {}, issue: ISSUE, worktreeStdout: '{"result":{}}', exec: boom, fetchFn: failingFetch }), false);
  assert.equal(await startAgent({ config: {}, issue: { ...ISSUE, identifier: '?!' }, worktreeStdout: ROOT, exec: boom, fetchFn: failingFetch }), false);
});
