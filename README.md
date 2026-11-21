# Trama

Ateliê visual pessoal em português, construído com React, Vite e o editor open source do [Excalidraw](https://github.com/excalidraw/excalidraw).

[Abrir a Trama](https://trama-quadros.vercel.app)

## Usar

Crie um projeto pelo **+** da barra lateral ou abra um dos três quadros de exemplo. Cole ou arraste uma URL para o quadro. Também é possível criar um quadro já com uma referência na área de trabalho.

Cada referência ganha uma prévia que participa da cena como uma imagem. Desenhe por cima, conecte setas e selecione **Legenda** para inserir um texto editável abaixo. **Abrir referência** abre o player do YouTube ou Vimeo, vídeos e fotos de posts do X (ou links diretos de imagem/vídeo HTTPS) e a prévia de leitura no próprio quadro. Feche o painel para voltar a desenhar.

Publicações em subdomínios do Substack com endereço `/p/…` usam título, autoria, resumo e capa quando disponíveis. Outras páginas HTTPS públicas usam título, resumo e imagem de capa informados pelo site. Quando a página impede a consulta, a referência mantém o domínio e um título derivado da URL. A disponibilidade de metadados, imagens e reprodução depende do provedor.

Em **Ajustes**, controle a suavização do mouse ou crie um texto com uma fonte instalada ou importada. O texto personalizado fica registrado junto com a imagem e pode ser editado ao selecioná-la na Trama. Textos criados com a ferramenta nativa do Excalidraw permanecem elementos de texto.

Escolha **Sistema**, **Claro** ou **Escuro** no seletor de tema da área de trabalho ou do editor. O modo Sistema acompanha mudanças de aparência do dispositivo. A escolha manual fica salva neste navegador.

## Armazenamento e sincronização

Quando `DATABASE_URL` (PostgreSQL, como Neon) está configurada no servidor, a Trama exige autenticação por e-mail e senha (hash `scrypt` e cookie de sessão `HttpOnly`) e sincroniza projetos, quadros, cenas, arquivos e biblioteca automaticamente entre todos os seus dispositivos. Quadros já salvos no navegador local são migrados automaticamente para sua conta ao entrar pela primeira vez.

Sem `DATABASE_URL`, a aplicação funciona em modo local usando o IndexedDB do navegador. Em ambos os modos, você pode exportar cópias em `.excalidraw` em **Ajustes → Baixar cópia .excalidraw**.

O navegador solicita metadados de referências à função `/api/preview`, que consulta os serviços reconhecidos ou os metadados de páginas HTTPS públicas. As imagens de capa e os players são carregados dos provedores. A aplicação não precisa de chave de API para pré-visualizações.

## Desenvolvimento

Requer Node.js 22.12+ ou 24+.

```sh
npm ci
npm run dev
```

O servidor de desenvolvimento também atende as rotas `/api/preview`, `/api/auth` e `/api/workspace`. Para gerar a versão de produção, execute `npm run build`. Na Vercel, o código em `api/` é publicado como função e os arquivos em `dist/` como site estático.

Os testes de navegador usam Playwright. Instale o Chromium com `npx playwright install chromium` e execute `npm test` (modo local e mídia) e `npm run test:cloud` (autenticação e sincronização entre dispositivos).

## Licença

MIT. As dependências mantêm as próprias licenças.
