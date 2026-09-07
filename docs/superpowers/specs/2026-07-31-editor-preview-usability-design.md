# Editor visual simples e previews fiéis

## Objetivo

Tornar o editor compreensível para uma pessoa acostumada a Google Sites ou Wix e fazer os modos Desktop, Tablet e Celular representarem de verdade o layout responsivo publicado.

## Diagnóstico

O preview atual reduz apenas a largura de `.k5-site` dentro de uma janela que continua com largura de desktop. As media queries do site continuam lendo a largura do navegador, não a largura da área reduzida. O resultado é um site estreito com navegação, tipografia e componentes ainda em modo desktop. Além disso, o painel mistura conteúdo global, blocos, propriedades, seções, tema, rascunho e publicação em abas sobrepostas, enquanto controles de seção flutuam por cima do conteúdo.

## Alternativas consideradas

1. Manter o painel atual e corrigir só o CSS dos previews. É a mudança menor, mas mantém a interface difícil de entender e exige duplicar muitas media queries.
2. Renderizar o site em um `iframe` por tamanho. Produz media queries reais, mas cria sincronização complexa para seleção, edição inline, arrastar blocos e estado do Pinia.
3. Usar uma prancheta com container queries e estados responsivos explícitos, além de separar ferramentas por função. É a solução escolhida: preserva a edição ao vivo, corrige o comportamento responsivo sem duplicar a aplicação e reduz a carga visual.

## Estrutura escolhida

- Barra superior: nome do editor, desfazer/refazer, seletor Desktop/Tablet/Celular, salvar e publicar.
- Painel principal: uma navegação simples com `Adicionar`, `Seções`, `Conteúdo` e `Design`.
- Propriedades contextuais: ao selecionar um bloco, o painel muda para as opções daquele bloco e oferece um botão claro para voltar.
- Prancheta central: fundo neutro, moldura do dispositivo, largura informada e página centralizada.
- Controles de seção: aparecem apenas quando a seção está selecionada ou sob foco, com nomes simples em vez de vários botões sempre visíveis.

## Preview responsivo

O elemento raiz do site passa a ser um container CSS no modo de edição. Os estilos responsivos compartilhados usam container queries durante o preview e media queries para visitantes. Desktop usa toda a área disponível, Tablet usa 768 px e Celular usa 390 px. A página continua editável no mesmo DOM, mas navegação, colunas e blocos respondem à largura da prancheta.

Quando a janela do administrador for menor que a soma do painel e do aparelho escolhido, a prancheta recebe escala visual para caber sem alterar a largura lógica do preview. A interface exibe o tamanho e a porcentagem de escala para não dar uma impressão enganosa.

## Simplificação da interface

- Remover a aba genérica `Mais opções`.
- Evitar que `Adicionar conteúdo` e `Bloco selecionado` pareçam a mesma aba.
- Manter ações destrutivas fora do fluxo principal.
- Exibir somente um painel de controles por vez.
- Usar texto direto: `Adicionar`, `Organizar`, `Editar`, `Design`, `Salvar rascunho`, `Publicar`.
- Preservar edição inline: clicar no conteúdo continua sendo o caminho mais rápido.

## Segurança e compatibilidade

- Não alterar o formato salvo dos layouts.
- Preservar histórico, rascunhos e publicação existentes.
- Não abrir navegador visível durante os testes.
- Manter foco de teclado e preferência por movimento reduzido.
- Em telas administrativas pequenas, o painel vira uma gaveta sobreposta sem fingir que consegue mostrar um tablet inteiro em tamanho real.

## Validação

- Testes contratuais para a nova estrutura e para os três tamanhos.
- Build de produção.
- Teste headless autenticado comparando larguras, estado responsivo e screenshots de Desktop, Tablet e Celular.
- Verificação de adicionar bloco, selecionar, editar propriedades, desfazer/refazer e publicar sem regressão.

