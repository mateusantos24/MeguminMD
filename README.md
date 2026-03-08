# 🤖 Hanako-kun Bot

**Desenvolvido por:** Rei Ayanami (FuriaDaNoiteBR)  
**Versão:** 3.2.0  
**Linguagem:** JavaScript (Node.js / Bun)

Hanako-kun é um bot de WhatsApp com foco em estabilidade e recursos (schedulers, banco SQLite, hot reload e integrações). O projeto usa Baileys para conexão com o WhatsApp e carrega comandos automaticamente a partir de `lib/commands`.

## ✅ Números verificados deste repositório

- **Arquivos de comandos:** 399 arquivos `.js` em `lib/commands` (cada comando pode ter aliases, então o total de gatilhos pode ser maior)
- **Categorias de comandos:** 17 pastas/categorias em `lib/commands`
- **Bancos SQLite (arquivos):** 63 arquivos `.db` em `data/DB` (fora os arquivos `.db-wal` e `.db-shm`)

## � Requisitos

- Node.js (recomendado para produção) ou Bun
- Dependências nativas importantes do projeto: `better-sqlite3`, `sharp`, `@napi-rs/canvas`
- FFmpeg/FFprobe são usados via `@ffmpeg-installer/ffmpeg` e `@ffprobe-installer/ffprobe`

## � Como rodar

### 1) Instalar dependências

```bash
npm install
```

Opcional (Bun):

```bash
bun install
```

### 2) Configurar `.env`

Copie `.env.example` para `.env` e substitua os valores. Variáveis encontradas no código hoje:

- **Geral/paths:** `DB_PATH`, `GITHUB_BACKUP_REMOTE`, `GITHUB_BACKUP_AUTHOR_NAME`, `GITHUB_BACKUP_AUTHOR_EMAIL`
- **YouTube/serviços:** `TENOR_API_KEY`, `TMDB_API_KEY`
- **STT/Transcrição:** `ASSEMBLYAI_API_KEY` (ou `ASSEMBLYAI_TOKEN`/`ASSEMBLYAI_KEY`), `STTV3_*`, `WHISPER_API_URL`
- **Anti-bot/anti-delete:** `ANTIBOT*`, `ANTIDELETE*`
- **Outros:** `EVENTOLOGS`, `OWNER_GROUP_JID`, `BRAWL_KEY_ROTATION`, `ANTIGROUPS_ALLOWLIST`

### 3) Ajustar configurações do bot

Arquivo: `config/config.js`

- Prefixos (padrão): `['!', '/', '.', '#', '>', '$', '%', '&', '*', '~']`
- Dono(s): `ownerNumber`, `ownerLid`
- Pairing Code (opcional): `pairingCode.enabled`, `pairingCode.phoneNumber`
- Backup GitHub (opcional): `backup.github.enabled` + `GITHUB_BACKUP_REMOTE`

### 4) Iniciar

Node:

```bash
npm start
```

Modo desenvolvimento (watch do Node):

```bash
npm run dev
```

Bun:

```bash
npm run start:bun
npm run dev:bun
```

## 🧩 Como os comandos funcionam

- O loader varre `lib/commands` recursivamente e registra cada módulo `.js` pelo `name` e `aliases`.
- O parse de comando usa os `prefixes` do `config/config.js`.
- Dispatcher principal: `messages.upsert` → `MessageHandler` → `CommandHandler.execute(...)`.
- Para listar comandos no WhatsApp: use `menu` (ex.: `/menu` ou `!menu`). Para filtrar por categoria: `menu <categoria>`. Para mostrar aliases: `menu <categoria> -aliases`.
- Alguns comandos são protegidos por flags como `ownerOnly`, `adminOnly`, `groupOnly`, `subOwnerOnly` e afins.

## � Fluxo de inicialização (index.js)

- Carrega dotenv e configura locale/timezone.
- Carrega Baileys dinamicamente (`lib/utils/baileysLoader`).
- Cria/usa sessão multi-arquivo em `data/sessions`.
- Abre o socket WhatsApp e registra listeners (QR no terminal e processamento de mensagens).
- Inicializa serviços e schedulers (banco, evento, YouTube notifier, etc.).

## ��️ Categorias e total de comandos (arquivos)

Total: **399**

- Diversao: 80
- Dono: 50
- Admin: 38
- Supercell: 38
- Dados: 35
- Games: 35
- Download: 23
- Utilitarios: 22
- VIP: 16
- IA: 15
- MC: 13
- Economy: 8
- Geral: 7
- Sticker: 7
- YouTube: 7
- Events: 4
- CR: 1

## 📁 Estrutura do projeto (resumo)

```
hanakokun/
├── config/                 # Config principal do bot (prefixos, owners, flags)
├── data/                   # DBs SQLite, assets e dados do bot
├── lib/
│   ├── commands/           # Comandos (carregados automaticamente)
│   ├── database/           # Camada de acesso aos DBs
│   ├── handlers/           # Handlers de mensagem/comando
│   ├── schedulers/         # Jobs (banco, eventos, pagamentos etc.)
│   ├── security/           # Gate/Watcher
│   ├── services/           # Integrações (YouTube, MercadoPago, etc.)
│   └── utils/              # Utilitários
├── .env.example
├── backup.js
├── crash.json
├── eslint.config.mjs
├── index.js                # Entrypoint
└── package.json
```

## 🧪 Scripts (package.json)

- `npm start` → `node index.js`
- `npm run dev` → `node --watch index.js`
- `npm run start:bun` → `bun index.js`
- `npm run dev:bun` → `bun --watch index.js lib backup`
- `npm run lint` / `npm run lint:fix` / `npm run lint:check`

## 🔐 Segurança

- Não compartilhe `.env`, `data/DB` nem a pasta de sessão (`data/sessions`).
- Se você usa serviços externos (IA, STT, MercadoPago, etc.), mantenha as chaves somente no `.env`.

## 👤 Autor

**Rei Ayanami** (FuriaDaNoiteBR)  
GitHub: [@mateusantos24](https://github.com/mateusantos24)

## 📝 Licença

MIT - Sinta-se livre para usar, modificar e compartilhar!
