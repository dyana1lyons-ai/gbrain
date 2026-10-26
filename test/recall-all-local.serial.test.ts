import { beforeAll, afterAll, describe, test, expect } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { runRecall } from '../src/commands/recall.ts';

let engine: PGLiteEngine;
beforeAll(async () => {
  engine = new PGLiteEngine(); await engine.connect({}); await engine.initSchema();
  for (let i = 0; i < 310; i++) await engine.insertFact({ fact: `Record ${i}`, kind: 'fact', entity_slug: 'cases/example', source: '[default:records/source] revision example', visibility: 'world', valid_from: new Date('2026-01-01') }, { source_id: 'default' });
  await engine.insertFact({ fact: 'Private fact must not be published', kind: 'fact', entity_slug: 'cases/example', source: '[default:records/private]', visibility: 'private' }, { source_id: 'default' });
  await engine.insertFact({ fact: 'Unrelated', kind: 'fact', entity_slug: 'cases/other', source: 'test' }, { source_id: 'default' });
});
afterAll(async () => { await engine.disconnect(); });
async function capture(args: string[]) {
  const write = process.stdout.write; let text = '';
  process.stdout.write = ((chunk: string) => { text += chunk; return true; }) as typeof write;
  try { await runRecall(engine, args); return JSON.parse(text); } finally { process.stdout.write = write; }
}
describe('complete exact-entity recall', () => {
  test('drains every page, retains provenance and validity, and preserves default cap', async () => {
    const out = await capture(['cases/example', '--source', 'default', '--json', '--all']);
    expect(out.complete).toBe(true); expect(out.total).toBe(310);
    expect(out.facts.every((r: any) => r.visibility === 'world')).toBe(true);
    expect(new Set(out.facts.map((r: any) => r.fact_id)).size).toBe(310);
    expect(out.facts.every((r: any) => r.entity_slug === 'cases/example' && r.source_id === 'default' && r.provenance === '[default:records/source] revision example' && r.valid_until === null)).toBe(true);
    const legacy = await capture(['cases/example', '--source', 'default', '--json', '--limit', '100']);
    expect(legacy.total).toBe(100); expect(legacy.complete).toBeUndefined();
  });
  test('private-page facts are excluded before pagination', async () => {
    await engine.putPage('cases/private-example', { title: 'Private example', type: 'note', frontmatter: { visibility: 'private' }, compiled_truth: '# private', timeline: '' }, { sourceId: 'default' });
    const hidden = await engine.insertFact({ fact: 'Hidden provenance', kind: 'fact', entity_slug: 'cases/private-example', source: '[default:records/source]', visibility: 'world' }, { source_id: 'default' });
    await engine.executeRaw('UPDATE facts SET source_markdown_slug=$1 WHERE id=$2', ['cases/private-example', hidden.id]);
    const out = await capture(['cases/private-example','--source','default','--json','--all']);
    expect(out.complete).toBe(true); expect(out.total).toBe(0);
  });
  test('empty exact entity never broadens to a text match', async () => {
    const out = await capture(['Record', '--source', 'default', '--json', '--all']);
    expect(out.complete).toBe(true); expect(out.facts).toEqual([]);
  });
  test('explicit source and unambiguous complete mode are required', async () => {
    for (const args of [ ['cases/example','--all','--json'], ['cases/example','--source','default','--all'], ['cases/example','--source','default','--all','--json','--question','a question'], ['cases/example','--source','default','--all','--json','--since','1d'] ]) {
      await expect(runRecall(engine, args)).rejects.toThrow('--all requires');
    }
  });
  test('refuses changed second scan without printing any certified output', async () => {
    const original = engine.listFactsByEntity.bind(engine); let scans = 0;
    engine.listFactsByEntity = async (source, entity, opts) => {
      const rows = await original(source, entity, opts);
      if (opts?.offset === 0) scans++;
      return scans > 1 && rows.length ? [{ ...rows[0], fact: 'Changed' }, ...rows.slice(1)] : rows;
    };
    try { await expect(capture(['cases/example', '--source','default','--all','--json'])).rejects.toThrow('Facts changed'); }
    finally { engine.listFactsByEntity = original; }
  });
  test('refuses duplicate pagination and foreign source rows', async () => {
    const original = engine.listFactsByEntity.bind(engine);
    for (const foreign of [false, true]) {
      engine.listFactsByEntity = async (source, entity, opts) => {
        const rows = await original(source, entity, { ...opts, offset: 0 });
        return foreign ? rows.map(r => ({ ...r, source_id: 'other' })) : rows;
      };
      try { await expect(capture(['cases/example','--source','default','--all','--json'])).rejects.toThrow('out-of-scope'); }
      finally { engine.listFactsByEntity = original; }
    }
  });
});
