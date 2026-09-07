# Arquitetura global — Home inspirada no Canva

## Design aprovado

O usuário aprovou reproduzir a linguagem visual do Canva enviado: composição editorial dividida, grande área de imagem, área branca de conteúdo, tipografia marcante e poucos elementos. O conteúdo será o conteúdo real do Jewish Educational Resources.

## Decisões

- A Home continua pertencendo a `HomeView.vue`; não será criado um segundo motor de página.
- `EditableSetting` e `EditableImage` continuam sendo o limite público de edição.
- A imagem usa os arquivos locais otimizados quando estiver no valor padrão; imagem enviada pela administradora continua suportada pelo componente editável.
- O iframe do Canva deixa de ser renderizado. A antiga chave pode permanecer no backend por compatibilidade de dados, mas não participa da apresentação.
- Header, busca, login, catálogo e footer não mudam.

## Alternativas rejeitadas

- Incorporar a página do Canva: criaria dependência externa, atraso visual e controles que não pertencem ao site.
- Copiar literalmente o conteúdo esportivo da referência: não corresponde à marca nem ao objetivo educacional.
- Criar um novo sistema de edição: duplicaria responsabilidades já resolvidas pelo editor atual.

## Recuperação

Reverter o commit da mudança restaura o markup e o CSS anteriores. Nenhuma migração de dados é necessária.
