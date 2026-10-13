# Design do Canva integrado ao site

Este documento registra a home nativa preparada em 12/10/2026. Desde 13/10/2026, a home ativa volta a ser controlada pelo link de Settings. A versão nativa permanece guardada e aparece quando esse campo fica vazio. Veja [Trocar a página inicial pelo link do Canva](canva-home-link.md) para o funcionamento atual.

O visual usa a referência `DAHXc1BjEC4`, com azul `#003366`, fundo creme, textos e as duas fotos do design. A home usa blocos nativos do editor. Cabeçalho, biblioteca, material, download e acesso usam a mesma paleta. Os botões da home abrem `/library` e os cartões de novidades vêm dos materiais publicados.

## Como editar

- **Edit site → Home**: clique no bloco que deseja alterar. As opções abrem em **Properties**. Nos botões, use **Button text** e **Link**; nas fotos, **Upload image**. Publique pelo editor.
- **Admin → Appearance**: ajuste as cores e demais opções do tema.
- **Admin → Settings → Canva home → Canva design link**: define o Canva usado na home. Apague e salve se quiser usar a home nativa descrita neste documento.
- **Admin → Materials**: continue gerenciando os documentos. As novidades da home acompanham os materiais publicados.

A edição da home nativa é feita no editor e em Appearance. Quando o campo Canva design link está preenchido, o design da home é editado no Canva. Apresentações e aulas incorporadas continuam disponíveis como conteúdo independente.

## Configuração

`createCanvaNativeSettings`, em `frontend/src/utils/canvaNativeDesign.js`, prepara a configuração a partir dos valores atuais e de `frontend/src/assets/canva-native.css`. A função preserva as seções existentes da home, substitui apenas suas duas seções identificadas e mantém CSS customizado anterior fora do bloco marcado. Uma nova execução não duplica esses blocos.

A configuração define `canva_integration_mode=native`, move o link de `home_canva_url` para `canva_design_reference_url` e deixa `home_canva_url` vazio. Isso também faz versões anteriores do layout exibirem a home nativa. O componente `PublicLayout.vue` possui uma verificação adicional do modo. O campo de Settings grava a referência no novo nome quando esse modo está ativo.

O bloco Canva que repetia essa mesma apresentação antes da biblioteca fica oculto. Seus dados continuam no documento do editor. Outros blocos e páginas são preservados. `library_root_catalog_show=true` habilita os materiais no catálogo principal.

## Publicação preservando a versão atual

A versão publicada contém mudanças de outro desenvolvedor cujo código completo ainda não está nesta branch. Por isso, esta entrega conserva os módulos e o backend dessa versão. Acrescenta as duas imagens, o módulo Settings atualizado e uma cópia do layout atual com uma única alteração no editor: selecionar um bloco nativo abre suas propriedades. O import map direciona esses dois módulos para as cópias corrigidas. Na função `api`, apenas `generated/index.html` recebe o mesmo HTML do Hosting.

`scripts/prepare-canva-native-release.js` recebe `currentDist`, `settingsBundle`, `outputDist` e `imageDirectory`. Ele reutiliza as verificações de `restore-admin-settings.js` e retorna os quatro arquivos adicionados. A preparação não publica nem acessa credenciais. A alteração do editor exige a assinatura exata do módulo publicado; versões incompatíveis ou já alteradas são recusadas. O mesmo comportamento está no código fonte de `EditorWorkspace.vue`.

Na ativação, compare os valores atuais e os horários de atualização dos documentos antes de escrever a configuração. Aplique as alterações em uma transação e incremente `editor_revision`, para invalidar o cache do editor. A configuração do Hosting, as variáveis e os secrets da API devem ser preservados.

Publicação conferida em 12/10/2026: Hosting `b18d058427ba5fe5`, API `api-00086-mub`, revisão do editor `25`. Os 109 arquivos anteriores fora de `index.html` mantêm os mesmos hashes. Há 114 arquivos na publicação.

O registro reversível da ativação fica em `/Users/felipebianchini/Developer/artifacts/jewisheducational-canva-integrado-2026-10-12/activation-record.json`. Ele contém os valores anteriores e aplicados, sem credenciais. Antes de reverter, compare os valores aplicados com os valores atuais para preservar edições posteriores.

## Verificação

O gate `verify:release` passou com 280 testes: 107 do backend, 167 do frontend e 6 dos utilitários. Os testes novos cobrem a composição nativa, os links, a preservação de configurações e conteúdo, a repetição da preparação, a conservação dos módulos publicados e a recusa de versões incompatíveis do editor.

No navegador, a home e a biblioteca exibem conteúdo real sem o iframe de apresentação. Foram conferidos os botões para a biblioteca, a busca por `Alphabet`, a abertura do material e o pedido de login ao baixar. No editor local, selecionar botão e foto abriu as propriedades. Trocar o link e desfazer a alteração restaurou `/library`. O login com credenciais de teste foi validado apenas no ambiente local. O download autenticado em produção não foi executado nesta verificação.

| Referência | Resultado e adaptação |
| --- | --- |
| Fundo creme e azul `#003366` | Aplicados à home e aos controles das páginas funcionais. |
| Título, texto principal, fotos e chamadas | Usados em blocos nativos, com links reais para a biblioteca. |
| Fontes do Canva | Arial no site; não foram redistribuídas fontes proprietárias. |
| Apresentação de largura fixa | Duas colunas no computador e uma coluna no celular. A grade móvel foi corrigida para evitar corte lateral. |
| Navegação e documentos | Mantidos como componentes funcionais do site, com o tema da referência. |

Antes de uma publicação completa futura, reúna o código mais recente dos desenvolvedores e integre os componentes desta branch. O build normal dispensa o import map de recuperação. A configuração nativa permanece no banco.
