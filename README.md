<div align="center">
  <img src="https://files.catbox.moe/m6i8i3.jpeg" alt="Megumin Bot Logo" width="100%" style="border-radius: 8px; margin: 20px 0;">
</div>

<h1 align="center">Megumin Bot</h1>

<p align="center">
  <b>Bot avançado para WhatsApp</b><br>
  Modular • SQLite • Automação • Base pública
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-6.1.5-blue?style=flat-square">
  <img src="https://img.shields.io/badge/status-active-success?style=flat-square">
  <img src="https://img.shields.io/badge/publico-github-green?style=flat-square">
  <img src="https://img.shields.io/badge/core-privado-red?style=flat-square">
  <img src="https://img.shields.io/badge/suporte-WhatsApp-25D366?style=flat-square">
  <img src="https://img.shields.io/badge/database-SQLite-orange?style=flat-square">
</p>

> Este repositório é uma base pública/reservada do Megumin Bot. A versão completa paga não está incluída aqui.

---

## Acesso rápido

<p align="center">
  <a href="https://wa.me/554198277107?text=Ol%C3%A1%2C%20tenho%20interesse%20no%20Megumin%20Bot">
    <img src="https://img.shields.io/badge/Falar%20com%20o%20dono-WhatsApp-25D366?style=for-the-badge&logo=whatsapp">
  </a>
  &nbsp;
  <a href="https://chat.whatsapp.com/GVqv7dFXBjcFZ1FmUX7hmX">
    <img src="https://img.shields.io/badge/Entrar%20no%20grupo%20oficial-Megumin-blue?style=for-the-badge">
  </a>
</p>

<p align="center">
  <b>Versão completa e paga:</b> R$100 via Pix.<br>
  Para adquirir, fale com o dono no WhatsApp ou entre no grupo oficial.
</p>

---

## Atualização 6.1.5

### Novidades

* **Anti-Call em grupos (`/anticall`)**

  * `/anticall on|off` para ativar ou desativar a proteção.
  * `/anticall modo 1` remove automaticamente quem tentar ligar.
  * `/anticall modo 2` registra e aplica ações configuráveis.

* **Melhorias no Anti-Grupos**

  * Correções no sistema de detecção.
  * Melhor compatibilidade com grupos protegidos.

* **Sistema AKA (PN/LID)**

  * Correções na sincronização e armazenamento.
  * Melhor desempenho em grupos grandes.

* **Sistema de Etiquetas**

  * Melhorias internas.
  * Correções no gerenciamento automático.

* **Correções gerais**

  * Ajustes de estabilidade.
  * Melhorias no banco SQLite.
  * Correções em handlers e schedulers.

---

## Sobre

**Megumin Bot** é um bot para WhatsApp com foco em automação, administração, economia, entretenimento e integrações externas.

O projeto possui uma estrutura modular, rápida de expandir e preparada para grandes comunidades e grupos.

### Visão geral

* **Versão atual:** `6.1.5`
* **Comandos:** `543+`
* **Categorias:** `16`
* **Schedulers:** `16`
* **Handlers:** `3`
* **Banco de dados:** `SQLite`
* **Base:** `Baileys + Node.js`

---

## Destaques

* Sistema completo de administração para grupos.
* Anti-Link, Anti-Spam, Anti-Call e Anti-Grupos.
* Auto Sticker em tempo real.
* Sistema VIP.
* Sistema de economia.
* Sistema de casas e propriedades.
* Eventos automáticos e bônus especiais.
* Sistema de rank global.
* Integração com newsletters e canais.
* Integrações externas e APIs.
* Estrutura baseada em SQLite.
* Compatível com Linux, VPS, Windows e Termux.

---

## Jogos disponíveis

* UNO
* Gartic
* Forca
* Quiz
* TicTacToe
* Payday
* Cassino
* Sistema de apostas
* Eventos automáticos

---

## Integrações

* Brawl Stars
* Roblox
* Mercado Pago
* YouTube
* GitHub
* APIs próprias
* Canvas e renderizações dinâmicas

---

## Categorias de comandos

| Categoria   | Qtde |
| ----------- | ---- |
| admin       | 54   |
| ai          | 36   |
| casamentos  | 20   |
| dados       | 31   |
| diversao    | 85   |
| dono        | 84   |
| download    | 27   |
| economy     | 9    |
| events      | 5    |
| games       | 50   |
| geral       | 7    |
| sticker     | 17   |
| supercell   | 68   |
| utilitarios | 30   |
| vip         | 13   |
| youtube     | 7    |

---

## Schedulers

* antideletedScheduler.js
* bankScheduler.js
* brawlApiStatusScheduler.js
* brawlclubs.js
* brawlnetwork.js
* brawlstars.js
* CronScheduler.js
* dailyScheduler.js
* eventoScheduler.js
* githubschedulers.js
* paymentScheduler.js
* plantarScheduler.js
* robloxApiStatusScheduler.js
* shopScheduler.js
* birthdayScheduler.js
* tempoGPScheduler.js

---

## Instalação rápida

```bash
npm install
cp .env.example .env
npm start
```

---

## Instalação no Termux

```bash
cd ~/MeguminMD
rm -rf node_modules package-lock.json
npm install --omit=optional
npm start
```

> Não utilize `/sdcard`, `Download` ou armazenamento compartilhado para executar o bot, pois o Android pode bloquear symlinks utilizados pelo `node_modules`.

---

## Scripts úteis

```bash
npm run dev
npm run start:bun
npm run dev:bun
npm run lint
npm run lint:fix
npm run patch:baileys
```

---

## Observação

> Este repositório é apenas uma vitrine pública do projeto.

Parte dos sistemas internos, integrações privadas e recursos avançados permanecem fechados e não estão incluídos nesta versão.

* **Versão completa disponível por R$100 via Pix**
* **Suporte via WhatsApp**
* **Grupo oficial da comunidade**

---

<!-- Badge adicional -->

<img src="https://img.shields.io/badge/criado-2021--2026-blueviolet?style=flat-square">

<!-- Rodapé -->

<p align="center">
  Desenvolvido com ❤️ por <b>Rei Ayanami</b><br>
  <b>Megumin Bot © 2021-2026</b><br>
  Desde 2021 evoluindo e expandindo continuamente.
</p>

