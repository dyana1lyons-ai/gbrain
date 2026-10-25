import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { releaseCorpusClaim } from '../src/core/sweep-claim-cleanup.ts';

test('preserving a released claim moves it to Trash and never unlinks', async () => {
  const calls: unknown[][] = [];
  const io = {
    mkdir: async (...args: unknown[]) => { calls.push(['mkdir', ...args]); },
    rename: async (...args: unknown[]) => { calls.push(['rename', ...args]); },
    rm: async () => { throw new Error('unlink forbidden'); },
  };
  expect(await releaseCorpusClaim('/private/corpus/file.in-progress', true, io as any)).toBe(true);
  expect(calls[0]).toEqual(['mkdir', join(homedir(), '.Trash'), { recursive: true, mode: 0o700 }]);
  expect(calls[1][0]).toBe('rename');
  expect(calls[1][1]).toBe('/private/corpus/file.in-progress');
  expect(String(calls[1][2]).startsWith(join(homedir(), '.Trash', 'gbrain-corpus-claim-'))).toBe(true);
});

test('a failed preservation retains the claim rather than falling back to unlink', async () => {
  let removed = false;
  const io = { mkdir: async () => {}, rename: async () => { throw new Error('refused'); },
    rm: async () => { removed = true; } };
  expect(await releaseCorpusClaim('/private/claim', true, io as any)).toBe(false);
  expect(removed).toBe(false);
});

test('ordinary native cleanup stays compatible when preservation is not selected', async () => {
  const calls: unknown[][] = [];
  const io = { mkdir: async () => { throw new Error('unexpected'); },
    rename: async () => { throw new Error('unexpected'); },
    rm: async (...args: unknown[]) => { calls.push(args); } };
  expect(await releaseCorpusClaim('/private/claim', false, io as any)).toBe(true);
  expect(calls).toEqual([['/private/claim', { force: true }]]);
});
