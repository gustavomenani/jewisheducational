import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  join(backendDir, 'app.js'),
  join(backendDir, 'middleware'),
  join(backendDir, 'routes'),
  join(backendDir, 'utils'),
];

const forbidden = [
  /Banco de dados/i,
  /Tipo de arquivo/i,
  /Arquivo (?:não|obrigatório|removido)/i,
  /Material não encontrado/i,
  /Categoria (?:não|pai|excluída)/i,
  /Usuário (?:não|excluído)/i,
  /E-mail (?:já|e senha)/i,
  /Conta bloqueada/i,
  /Acesso restrito/i,
  /Erro ao/i,
  /Falha ao/i,
  /Limite atingido/i,
  /\bVocê\b/i,
  /Pagamentos? (?:desativados?|não concluído)/i,
  /Pedido inválido/i,
  /Nenhum plano/i,
  /Assinatura ativada/i,
  /\bpor (?:dia|semana|mês|ano)\b/i,
  /mês\(es\)/i,
  /não configurado/i,
  /Importação (?:concluída|só disponível)/i,
];

function sourceFiles(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    if (statSync(child).isDirectory()) return sourceFiles(child);
    return child.endsWith('.js') && !child.endsWith('.test.js') ? [child] : [];
  });
}

test('API messages exposed to the interface are English', () => {
  const violations = [];
  for (const file of targets.flatMap(sourceFiles)) {
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const pattern of forbidden) {
      if (pattern.test(source)) violations.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(violations, []);
});
