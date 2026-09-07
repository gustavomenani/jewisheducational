import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const forbidden = [
  /\bCadastrar\b/i,
  /\bCadastrando\b/i,
  /\bDuplicar\b/i,
  /\bDespublicar\b/i,
  /\bEntrando\b/i,
  /\bMascote\b/i,
  /\bNome\b/i,
  /\bPrincipal\b/i,
  /\bSenha\b/i,
  /\bcontato\b/i,
  /\be continuar\b/i,
  /\bDuplo clique\b/i,
  /\bAlterações pendentes\b/i,
  /\bDescartar\b/i,
  /\bClique para\b/i,
  /\bSeu navegador não suporta\b/i,
  /\bNenhuma categoria\b/i,
  /\bPalavras-chave\b/i,
  /\bPor dia\b/i,
  /\bPor semana\b/i,
  /\bPor ano\b/i,
  /\bIlimitado\b/i,
  /\bAbrir Google Analytics\b/i,
  /\bpáginas vistas\b/i,
  /\bSave integrações\b/i,
  /\bSave configurações\b/i,
  /\bAdicionar\b/i,
  /\bArrastar\b/i,
  /\bMostrar\b/i,
  /\bOcultar\b/i,
  /\bSó aparece\b/i,
  /\bVazio\b/i,
  /\bpadrão\b/i,
  /\bTexto\b/i,
  /\bImagem\b/i,
  /\bArquivos?\b/i,
  /\bCategorias?\b/i,
  /\bSem categoria\b/i,
  /\bNov[oa]\b/i,
  /\bGerar\b/i,
  /\bCapas?\b/i,
  /\bFundo\b/i,
  /\bCor\b/i,
  /\bTamanho\b/i,
  /\bConteúdo\b/i,
  /\bDescrição\b/i,
  /\bResumo\b/i,
  /\bAssuntos?\b/i,
  /\bUsuários?\b/i,
  /\bPlanos?\b/i,
  /\bPagamento\b/i,
  /\bSalvar\b/i,
  /\bExcluir\b/i,
  /\bFechar\b/i,
  /\bVoltar\b/i,
  /\bBaixar\b/i,
  /\bVisualizar\b/i,
  /\bGratuito\b/i,
  /\bEscola\b/i,
  /\bAtiv[oa]\b/i,
  /\bInativ[oa]\b/i,
  /\bBloquead[oa]\b/i,
  /\bRestantes\b/i,
  /\bErro ao\b/i,
  /\bFalha ao\b/i,
  /\bNão há\b/i,
  /\bNenhum[ao]?\b/i,
  /\bComo adicionar\b/i,
  /\bPara este\b/i,
  /\bApenas\b/i,
  /\bAtalhos\b/i,
  /\bFiltrar\b/i,
  /\bLimpar filtros\b/i,
  /\bFiltros ativos\b/i,
  /\bDestaques\b/i,
  /\bTitle do card\b/i,
  /\bEditando\b/i,
  /\bSalvo\b/i,
];

function vueFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? vueFiles(path) : path.endsWith('.vue') ? [path] : [];
  });
}

test('visible Vue templates contain English UI copy only', () => {
  const violations = [];
  for (const file of vueFiles(srcDir)) {
    const source = readFileSync(file, 'utf8');
    const withoutComments = source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const start = withoutComments.indexOf('<template>');
    const end = withoutComments.lastIndexOf('</template>');
    if (start < 0 || end <= start) continue;
    const template = withoutComments.slice(start, end);
    for (const pattern of forbidden) {
      if (pattern.test(template)) violations.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('known mixed-language editor and navigation copy is absent from Vue source', () => {
  const targeted = [
    /\bAtalhos\b/i,
    /\bFiltrar\b/i,
    /\bLimpar filtros\b/i,
    /\bFiltros ativos\b/i,
    /\bDestaques\b/i,
    /\bTitle do card\b/i,
    /\bEditando\b/i,
    /\bSalvo\b/i,
    /\bLibrary de recursos\b/i,
  ];
  const violations = [];
  for (const file of vueFiles(srcDir)) {
    const source = readFileSync(file, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const pattern of targeted) {
      if (pattern.test(source)) violations.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(violations, []);
});
