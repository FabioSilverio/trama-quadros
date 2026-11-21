# Trama

Ateliê visual pessoal em português, construído com React, Vite e o editor open source do [Excalidraw](https://github.com/excalidraw/excalidraw).

## Usar

Crie um projeto pelo **+** da barra lateral ou abra um dos três quadros de exemplo. Cole ou arraste uma URL para o quadro. Também é possível criar um quadro já com uma referência na área de trabalho.

Cada referência ganha uma prévia que participa da cena como uma imagem. Desenhe por cima, conecte setas e selecione **Legenda** para inserir um texto editável abaixo. **Abrir referência** abre o player do YouTube ou Vimeo, o post do X ou a prévia de leitura no próprio quadro. Feche o painel para voltar a desenhar.

Publicações em subdomínios do Substack com endereço `/p/…` usam título, autoria, resumo e capa quando disponíveis. Outros endereços recebem um cartão com domínio e título derivado da URL. A disponibilidade de metadados, imagens e reprodução depende do provedor.

Em **Ajustes**, controle a suavização do mouse ou crie um texto com uma fonte instalada ou importada. O texto personalizado fica registrado junto com a imagem e pode ser editado ao selecioná-la na Trama. Textos criados com a ferramenta nativa do Excalidraw permanecem elementos de texto.

## Armazenamento

Projetos, quadros, biblioteca e referências ficam no IndexedDB deste navegador e endereço. Cada visitante tem sua própria área de trabalho. A URL pública abre o aplicativo. Para transportar ou guardar uma cópia de um quadro, use a opção de salvar em arquivo no menu do Excalidraw. O formato `.excalidraw` inclui as imagens e os dados das referências. Limpar os dados do site apaga o acervo local.

O navegador solicita metadados de referências à função `/api/preview`, que consulta apenas os serviços reconhecidos. As imagens de capa e os players são carregados dos provedores. A aplicação não precisa de chave de API.

## Desenvolvimento

Requer Node.js 22.12+ ou 24+.

```sh
npm ci
npm run dev
```

O servidor de desenvolvimento também atende a rota de metadados. Para gerar a versão de produção, execute `npm run build`. Na Vercel, o código em `api/` é publicado como função e os arquivos em `dist/` como site estático.

Os testes de navegador usam Playwright. Instale o Chromium com `npx playwright install chromium` e execute `npm test`.

## Licença

MIT. As dependências mantêm as próprias licenças.
