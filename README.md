# Megumin Bot

Bot de WhatsApp construído com Baileys, foco em comandos modulares, banco SQLite, automações internas, sistema VIP, integrações externas e utilitários para grupos e conversas privadas.

## Créditos

Créditos do projeto: **Rei Ayanami**.

## Estado atual deste repositório

Esta revisão foi baseada na estrutura real do código presente hoje no repositório:

- `409` arquivos `.js` dentro de `lib/commands`
- `16` categorias de comandos: `admin`, `ai`, `casamentos`, `dados`, `diversao`, `dono`, `download`, `economy`, `events`, `games`, `geral`, `sticker`, `supercell`, `utilitarios`, `vip` e `youtube`
- `53` módulos `.js` em `lib/database`
- `13` schedulers em `lib/schedulers`
- `3` handlers principais em `lib/handlers`

## Novidades da versão 3.4.0

- Gerenciamento de presence com timeout em `lib/utils/presenceManager.js`, usando `sendWithTimeout(...)` para evitar que atualizações de typing/recording travem comandos
- Novo comando `/label` para administradores alterarem ou removerem a etiqueta do bot no grupo atual, com validação de entrada e suporte aos modos `auto`, `off` e texto personalizado
- Novo comando `/newsletters` para inspecionar, depurar e administrar canais/newsletters, incluindo rename, description, reaction e leitura de metadados
- Novo comando `/story` na categoria `dono` usando os métodos nativos de status/story do socket para texto, imagem, menções e envio para membros de grupos
- Novo utilitário `lib/utils/eventLogs.js` para centralizar logs de ações e falhas no `EVENTOLOGS`
- Melhorias em `monitoredDelivery` para fallback, aviso ao dono e tratamento de destinos inválidos
- Novo utilitário `lib/utils/richTableSender.js` para respostas formatadas com rich table quando a configuração permitir
- Anti-call refinado com bloqueio temporário automático após `3/3` tentativas dentro da janela configurada
- Atualização da versão do projeto para `3.4.0` com dependências e scripts alinhados ao estado atual do repositório

## Principais recursos

- Carregamento automático de comandos a partir de `lib/commands`
- Suporte a aliases, cooldown, sugestão de comandos parecidos e filtros por grupo
- Banco de dados SQLite com compatibilidade para Node.js (`better-sqlite3`) e Bun (`bun:sqlite`)
- Sessão do WhatsApp via SQLite ou multi-file auth state
- Hot reload em desenvolvimento
- Sistema VIP com níveis, regras por comando/categoria e painel dinâmico
- Schedulers para pagamentos, banco, tempo de grupo, backup, eventos, daily e integrações Supercell
- Notificador de YouTube com janela de silêncio configurável
- Integração com Mercado Pago
- UNO Web com servidor Express próprio
- Comandos nativos para etiqueta do bot em grupos e publicação de status/story
- Ferramentas para newsletters, rich tables e monitoramento centralizado de eventos
- Recursos de segurança, anti-delete, anti-link, anti-call e proteção para grupos

## Arquitetura resumida

- `index.js`
  Ponto de entrada do bot. Inicializa diretórios, carrega Baileys, autenticação, handlers, schedulers, serviços e reinício controlado.

- `lib/handlers/commandHandler.js`
  Faz o carregamento recursivo dos comandos, normaliza nomes e aliases, aplica cooldown, filtro por categoria, restrições VIP e executa os comandos.

- `lib/handlers/messageHandler.js`
  Centraliza leitura de mensagens, extração de mídia, proteção, eventos de grupo, menções, anti-delete, estatísticas e despacho para o command handler.

- `lib/database/sqlite.js`
  Camada de abstração para usar SQLite com Node.js ou Bun.

- `lib/database/vipDB.js`
  Controla usuários VIP, histórico, regras por feature/comando/categoria e o painel dinâmico do sistema premium.

- `lib/services`
  Contém integrações de runtime como `youtubeNotifier`, `mercadoPagoService`, `brawlClient` e `unoWebServer`.

- `lib/schedulers`
  Reúne tarefas automáticas como backup GitHub/local, pagamentos, eventos, daily, banco, YouTube e monitoramento da API do Brawl Stars.

## Estrutura principal

```text
.
├── config/
├── data/
├── databases_repo/
├── lib/
│   ├── commands/
│   ├── database/
│   ├── handlers/
│   ├── schedulers/
│   ├── security/
│   ├── services/
│   └── utils/
├── backup.js
├── index.js
└── package.json
```

## Requisitos

- Node.js para produção
- Bun opcional
- FFmpeg e FFprobe disponíveis no ambiente
- Dependências nativas importantes: `better-sqlite3`, `sharp` e `@napi-rs/canvas`

## Instalação

### 1. Instalar dependências

```bash
npm install
```

Opcional com Bun:

```bash
bun install
```

### 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e ajuste os valores necessários.

Variáveis importantes já documentadas no projeto:

- `DB_PATH`
- `GEMINI_API_KEY`
- `TENOR_API_KEY`
- `TMDB_API_KEY`
- `ASSEMBLYAI_API_KEY`
- `EVENTOLOGS`
- `BACKUP_FILTER`
- `GITHUB_NOTIFIER`
- `GITHUB_AUTHORNAME`
- `GITHUB_AUTHOREMAIL`
- `GITHUB_DELAYHOURS`
- `GITHUB_RETRYMINUTES`
- `GITHUB_BACKUP_REMOTE`
- `MERCADO_PAGO_ACCESS_TOKEN`

Observação: parte das configurações operacionais também fica em `config/config.js`, incluindo prefixos, donos, sessão, manutenção, sistema de botões, anti-call, anti-link, YouTube notifier, registro, UNO Web e mensagens padrão.

## Destaques operacionais

- `/label`
  Comando administrativo para alterar a etiqueta do bot no grupo atual usando `sock.updateMemberLabel(groupJid, label)`. O projeto valida uso em grupo, limita o texto ao comportamento do WhatsApp e envia monitoramento da ação para `EVENTOLOGS`.

- `/newsletters`
  Comando administrativo para gerenciamento e debug de canais/newsletters com leitura de metadados, listagem de inscrições, rename, atualização de descrição, reação em mensagens e remoção de foto.

- `/story`
  Comando da categoria `dono` para publicar status/story com `sendMessage('status@broadcast', ...)`, `sendStatusMentions(...)` e `sendGroupStatus(...)`. Suporta texto, imagem por URL, envio por audiência manual e envio para membros de grupos.

- Etiquetas e histórico
    expõe `updateMemberLabel`, mas não traz uma listagem simples das etiquetas atuais no `groupMetadata`. Por isso, o projeto mantém histórico em `lib/database/labelDB.js` a partir dos eventos `GROUP_MEMBER_LABEL_CHANGE`.

- Presence
  O socket suporta `sendPresenceUpdate(...)` e `presenceSubscribe(...)`, e o projeto já inclui o wrapper `lib/utils/presenceManager.js` para controlar `composing`, `recording` e `paused`.

- Rich tables e logs
  O projeto inclui `lib/utils/richTableSender.js` para respostas em tabela formatada e `lib/utils/eventLogs.js` para concentrar logs operacionais, erros e fallback de envio ao `EVENTOLOGS`.

### 3. Iniciar o bot

```bash
npm start
```

Modo desenvolvimento:

```bash
npm run dev
```

Com Bun:

```bash
npm run start:bun
```

## Scripts disponíveis

- `npm start` inicia o bot com Node.js
- `npm run dev` inicia com `node --watch`
- `npm run start:bun` inicia com Bun
- `npm run dev:bun` inicia em watch mode com Bun
- `npm run lint` executa o ESLint
- `npm run lint:fix` corrige problemas automáticos do ESLint
- `npm run lint:check` falha se houver warnings

## Como os comandos são organizados

Cada comando é exportado como um módulo CommonJS e carregado automaticamente pelo handler.

Exemplo simplificado:

```js
module.exports = {
  name: 'ping',
  description: 'Verificar latência e informações do bot',
  category: 'utilitarios',
  aliases: ['latencia', 'p'],

  async execute(sock, messageData, args) {
    // lógica do comando
  }
};
```

## Bancos e persistência

- Os arquivos SQLite são criados automaticamente quando necessário
- O projeto usa `data/DB` para bancos auxiliares e `DB_PATH` para o banco principal
- A sessão do WhatsApp pode ser salva em SQLite ou em múltiplos arquivos, conforme `config/config.js`
- O diretório `databases_repo` é usado pelo sistema de backup GitHub

## Observações importantes

- O repositório está com muitas mudanças locais em comandos e sistema VIP; este README foi ajustado para refletir essa base atual
- O README anterior estava com texto corrompido por encoding; este arquivo foi refeito em UTF-8
- Caso novas categorias, bancos ou serviços sejam adicionados depois, atualize esta documentação para manter os números coerentes
