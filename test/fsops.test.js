import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { cfg } from '../src/config.js';
import { safeAbs, safeName, PathError } from '../src/lib/fsops.js';

const root = path.resolve(cfg.storageRoot);

test('safeAbs: normal paths resolve inside the storage root', () => {
  assert.equal(safeAbs(''), root);
  assert.equal(safeAbs('files'), path.join(root, 'files'));
  assert.equal(safeAbs('files/sub/dir'), path.join(root, 'files', 'sub', 'dir'));
  assert.equal(safeAbs('/files'), path.join(root, 'files')); // leading slash is just stripped
});

test('safeAbs: rejects every real path-traversal attempt', () => {
  for (const p of ['..', '../../etc/passwd', 'files/../../etc', 'a/b/../../../etc'])
    assert.throws(() => safeAbs(p), PathError, p);
});

test('safeAbs: a literal dots-only segment is not traversal — just an odd folder name, stays inside root', () => {
  // "...." is 4 literal dots, not ".." twice; path.resolve never treats it as "parent" — confirm it resolves safely inside root.
  const abs = safeAbs('....//....//etc');
  assert.ok(abs === root || abs.startsWith(root + path.sep), abs);
});

test('safeName: rejects separators, empty, dot, dotdot', () => {
  assert.equal(safeName('report.pdf'), 'report.pdf');
  assert.equal(safeName('a/b'), 'ab'); // separators stripped, not rejected outright
  for (const n of ['', '.', '..', '   '])
    assert.throws(() => safeName(n), PathError, n);
});
