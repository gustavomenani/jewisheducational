import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyPathRedirect } from './legacyRoutes.js';

test('maps Portuguese public paths to canonical English paths', () => {
  assert.equal(legacyPathRedirect('/biblioteca'), '/library');
  assert.equal(legacyPathRedirect('/biblioteca/category/torah'), '/library/category/torah');
  assert.equal(legacyPathRedirect('/material/atividade-purim'), '/resource/atividade-purim');
  assert.equal(legacyPathRedirect('/material/atividade-purim/baixar/7'), '/resource/atividade-purim/download/7');
  assert.equal(legacyPathRedirect('/material/atividade-purim/apresentar/7'), '/resource/atividade-purim/present/7');
  assert.equal(legacyPathRedirect('/cadastro'), '/sign-up');
  assert.equal(legacyPathRedirect('/recuperar-senha/abc'), '/reset-password/abc');
  assert.equal(legacyPathRedirect('/minha-conta'), '/my-account');
  assert.equal(legacyPathRedirect('/admin/configuracoes'), '/admin/settings');
  assert.equal(legacyPathRedirect('/not-a-legacy-route'), null);
});
