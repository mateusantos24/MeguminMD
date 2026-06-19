<div align="center">
  <img src="https://files.catbox.moe/m6i8i3.jpeg" alt="Megumin Bot Logo" width="100%" style="border-radius: 8px; margin: 20px 0;">
</div>

<h1 align="center">Megumin Bot</h1>

<p align="center">
  <b>Bot avançado para WhatsApp</b><br>
  Modular • SQLite • Automação • Base pública
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-5.2.0-blue?style=flat-square">
  <img src="https://img.shields.io/badge/status-active-success?style=flat-square">
  <img src="https://img.shields.io/badge/publico-github-green?style=flat-square">
  <img src="https://img.shields.io/badge/core-privado-red?style=flat-square">
  <img src="https://img.shields.io/badge/suporte-WhatsApp-25D366?style=flat-square">
</p>

> Este repositório é uma base pública/reservada do Megumin Bot. A versão completa paga não está incluída aqui.

---

## Acesso rápido

<p align="center">
  <a href="https://wa.me/554198277107?text=Ol%C3%A1%2C%20tenho%20interesse%20no%20Megumin%20Bot">
    <img src="https://img.shields.io/badge/Falar%20com%20o%20dono-WhatsApp-25D366?style=for-the-badge&logo=whatsapp">
  </a>
  &nbsp;
  <a href="https://chat.whatsapp.com/COb1Z0WZkwV3wZ4jEG0yeK">
    <img src="https://img.shields.io/badge/Entrar%20no%20grupo%20oficial-Megumin-blue?style=for-the-badge">
  </a>
</p>

<p align="center">
  <b>Versão completa e paga:</b> R$100 via Pix. Para adquirir, fale com o dono no WhatsApp ou entre no grupo oficial.
</p>

---

> Este repositório é uma vitrine pública do projeto. Parte do sistema, integrações internas e arquivos centrais permanecem privados.

## Atualização 5.6.0

Detalhes do release 5.6.0:

- **Clash Royale completo:** adicionados `/clashplayer`, `/clashclans`, `/clashdecks`, `/clashchests`, `/clashlog`, `/clashcode` e scheduler de status da API; renderizações em canvas para player profile, clan, battle log, chest cycle e decks.
- **Exclusão em newsletters/canais:** os comandos `/d` e `/deletar` agora suportam exclusão de mensagens em newsletters/canais usando o `server_id` da mensagem, sem necessidade de referência.
- **Reações em newsletters:** adicionado suporte para remoção de reações em newsletters via `/canais desreagir`.
- **YouTube Notifier:** verificação de permissões em newsletters antes de enviar notificações, removendo associações inválidas automaticamente.
- **Patch Baileys (newsletterDeleteMessage):** incluída função `newsletterDeleteMessage` no pacote `@itsliaaa/baileys` local para suportar exclusão de mensagens em canais.

## Sobre

**Megumin Bot** é um bot para WhatsApp com foco em automação, diversão, economia, monitoramento e integrações externas.  
O projeto é modular, rápido de expandir e possui uma base grande de comandos para grupos, administração e entretenimento.

### Visão geral

- **Versão atual:** `5.2.0`
- **Arquivos de comando:** `543`
- **Categorias:** `16`
- **Schedulers:** `16`
- **Handlers:** `3`

## Destaques

- Sistema completo de administração para grupos
- Auto sticker em tempo real no PV e em grupos
- Jogos como `UNO`, `Gartic`, `Forca`, `Quiz`, `TicTacToe` e `Payday`
- Sistema de casas com cofre, cobrança diária e status visual
- Estrutura de comandos, automações e permissões sem painel VIP
- Eventos automáticos e bônus especiais de fim de semana
- Integrações com `Brawl Stars`, `Roblox`, `Mercado Pago`, `YouTube` e mais
- Estrutura com schedulers, automações, monitores externos e banco SQLite

## Categorias de comandos

| Categoria | Qtde |
|-----------|------|
| `admin` | 54 |
| `ai` | 36 |
| `casamentos` | 20 |
| `dados` | 31 |
| `diversao` | 85 |
| `dono` | 84 |
| `download` | 27 |
| `economy` | 9 |
| `events` | 5 |
| `games` | 50 |
| `geral` | 7 |
| `sticker` | 17 |
| `supercell` | 68 |
| `utilitarios` | 30 |
| `vip` | 13 |
| `youtube` | 7 |

## Schedulers presentes

- `antideletedScheduler.js`
- `bankScheduler.js`
- `brawlApiStatusScheduler.js`
- `brawlclubs.js`
- `brawlnetwork.js`
- `brawlstars.js`
- `CronScheduler.js`
- `dailyScheduler.js`
- `eventoScheduler.js`
- `githubschedulers.js`
- `paymentScheduler.js`
- `plantarScheduler.js`
- `robloxApiStatusScheduler.js`
- `shopScheduler.js`
- `birthdayScheduler.js`
- `tempoGPScheduler.js`

## Instalação rápida

```bash
npm install
cp .env.example .env
npm start
```

## Instalação no Termux

> No Termux, instale e rode o bot dentro de `~/MeguminMD`.
> Não use `/sdcard`, `Download` ou armazenamento compartilhado para rodar `npm install`, porque o Android costuma bloquear symlinks em `node_modules/.bin`.

```bash
cd ~/MeguminMD
rm -rf node_modules package-lock.json
npm install --omit=optional
npm start
```

### Abrir no gerenciador de arquivos

Se quiser visualizar a pasta em apps como ZArchiver, MT Manager ou similares, copie apenas os arquivos para `Download`, mas mantenha a instalação real no home do Termux.

```bash
mkdir -p /storage/emulated/0/Download/MeguminMD
tar --exclude='node_modules' -cf - -C ~/MeguminMD . | tar -xf - -C /storage/emulated/0/Download/MeguminMD
```

### Scripts úteis

```bash
npm run dev
npm run start:bun
npm run dev:bun
npm run lint
npm run lint:fix
npm run patch:baileys
```

## Observação

> Este repositório é uma base pública/reservada do Megumin Bot. A versão completa paga não está incluída aqui.

- **Versão completa disponível por R$100 via Pix**
- **Contato:** [WhatsApp do dono](https://wa.me/554198277107?text=Ol%C3%A1%2C%20tenho%20interesse%20no%20Megumin%20Bot)
- **Grupo oficial:** [https://chat.whatsapp.com/COb1Z0WZkwV3wZ4jEG0yeK](https://chat.whatsapp.com/COb1Z0WZkwV3wZ4jEG0yeK)
