# Escopo — Home inspirada no Canva

Fonte aprovada: pedido da cliente e confirmação do usuário em 2026-09-07 para reproduzir, de forma nativa, a composição visual do Canva enviada na conversa.

## Resultado

Substituir a entrada atual por uma Home nativa, limpa e editorial, com imagem forte e conteúdo lado a lado, sem incorporar o Canva e sem reexibir seções antigas ou rascunhos durante o carregamento.

## REQ-001: Entrada nativa em composição dividida

A Home deve apresentar uma composição de tela ampla inspirada no modelo: painel visual e painel de conteúdo, com título, texto de apoio e ações úteis para a biblioteca.

## REQ-002: Conteúdo principal editável

Título, texto de apoio, imagem, texto alternativo e botões da entrada devem continuar editáveis diretamente pelo editor visual existente.

## REQ-003: Sem incorporação ou conteúdo antigo

A página pública não deve renderizar iframe do Canva, conteúdo de teste, seções ocultas nem valores de rascunho enquanto as configurações publicadas carregam.

## FLW-001: Jornada de entrada

O visitante abre a Home, entende o propósito do site e pode seguir para a biblioteca ou criar uma conta sem perder o menu, a busca ou o login.

## NFR-001: Responsividade e acessibilidade

O layout deve preservar leitura, foco visível, texto alternativo e ações utilizáveis em desktop, tablet e celular, sem rolagem horizontal.

## Aceite observável

- Em desktop, imagem e conteúdo formam uma composição dividida e proporcional.
- Em celular, os painéis empilham com imagem legível e ações acessíveis.
- Todos os elementos principais podem ser selecionados no editor.
- Não existe iframe de Canva na Home pública.
- O primeiro carregamento aguarda as configurações publicadas e não pisca o layout antigo.
- A suíte de release do projeto e o build do frontend passam.

## Fora de escopo

- Alterar catálogo, pagamentos, autenticação ou páginas internas.
- Copiar imagens, textos ou marca do site de referência.
- Manter o Canva como mecanismo de renderização da Home.
