import { expect, test } from 'bun:test';
import { detachedSupervisorArgs } from '../src/core/minions/detached-stderr.ts';

test('a compiled supervisor is re-executed without its virtual source path', () => {
  const args = ['jobs', 'supervisor', 'start', '--queue', 'example'];
  expect(detachedSupervisorArgs('/opt/example/bin/gbrain', '/$bunfs/root/gbrain', args)).toEqual(args);
  expect(detachedSupervisorArgs('/opt/example/bin/bun', '/source/cli.ts', args)).toEqual(['/source/cli.ts', ...args]);
  expect(detachedSupervisorArgs('/opt/example/bin/node', '/source/cli.js', args)).toEqual(['/source/cli.js', ...args]);
  expect(args).toEqual(['jobs', 'supervisor', 'start', '--queue', 'example']);
});
