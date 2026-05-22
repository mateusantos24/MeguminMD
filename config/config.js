const P = require('pino');

module.exports = {
    // ✅ MÚLTIPLOS PREFIXOS PADRÃO
    prefixes: ['!', '/', '.', '#', '>', '$', '%', '&', '~'],

    // Configurações do bot
    botName: 'Megumin Bot',

    // Configurações do Baileys
    // name.modules: nome do módulo do Baileys a ser usado (pode ser personalizado)
    // name.pathbaileys:
    // - 'auto' = modo padrão. Se for whiskeysockets oficial, não aplica [PATH-BAILEYS].
    // Se for outro pacote Baileys/modificado, tenta aplicar patch automático.
    // - true = força o patch automático mesmo no módulo oficial.
    // - false = ignora totalmente o path-baileys sem aplicar patch.
    name: {
        modules: '@itsliaaa/baileys',
        pathbaileys: 'auto'
    },

    // Configurações básicas de donos e sub-donos
    // *OwnerNumber* → pode usar o comando /dono e ter acesso a todos os comandos em qualquer servidor
    // *OwnerLid* → mesma função do OwnerNumber, pode usar /dono e acessar comandos do dono
    // Exemplo: ['123456789@s.whatsapp.net']
    ownerNumber: ['123456789@s.whatsapp.net'], // Altere para seus números
    ownerLid: ['999999999@lid'], // Altere para seus LIDs

    // *SubOwner* → comando /dono mostra apenas a lista de comandos do Sub-Dono
    // Diferente do dono, comandos ocultos ou com permissão especial não aparecem
    // Anti-Subdono → impede que comandos do Sub-Dono apareçam para o dono, apenas visíveis com permissões específicas
    // Exemplo: ['999999999@lid']
    subowner: ['999999999@lid'], // Altere para seus LIDs

    // Observação:
    // - O banco de dados carregará números pessoais (PN) ou LID.
    // - Pode mostrar @LID ou @s.whatsapp.net dependendo da regra.
    // - bot: true permite reconhecer JIDs @bot (Meta AI).
    // - Somente LID filtra para IDs principais do banco.
    // - Somente PN filtra apenas números de WhatsApp pessoais.
    jidRules: {
        allowLidPn: true, // permite LID e PhoneNumber
        bot: true, // permite reconhecer mensagens de @bot (Meta AI)
        onlyLid: false, // apenas LID principal
        onlyPn: false // apenas PhoneNumber
    },

    // Gerenciamento do Auth State do WhatsApp
    // useDatabase: false = usa multi-file auth state em /data/sessions
    // useDatabase: true = usa banco SQLite em /data/sessions/DB/auth_state.db
    authSession: {
        useDatabase: true,
        sessionDir: 'data/sessions',
        dbPath: 'data/sessions/DB/auth_state.db'
    },

    // Configurações de sticker
    // Esse é o padrão do stickerConfig para criar figurinhas, mas você pode modificar. 
    // É possível renomear o banco de dados existente para salvar suas figurinhas usando /renomear. 
    // O comando /s mantém a figurinha com seu nick no banco de dados e carrega suas informações salvas.
    // O `id` é sempre oculto, criado pelo dono do bot, e serve apenas para metadata da figurinha.
    stickerConfig: {
        pack: 'Rei',
        author: 'Ayanami 🔥',
        id: 'Seu Nome Aqui',
        stickerQuality: 100
    },

    // O muteGlobal ignora comandos de todos os grupos e conversas pessoais. Somente o dono pode usar comandos.
    // Se alguém tentar usar comandos em conversas pessoais enquanto o muteGlobal está ativado, o bot irá ignorar sem responder.
    // Isso funciona como uma manutenção, ativando o muteGlobal nesse caso.
    // Porém, dependendo dos Schedulers, o bot ainda pode enviar notificações automáticas ou respostas programadas.
    muteGlobal: false,

    // Configurações de Pairing Code (*código de pareamento*)
    // Funciona como uma personalizada para garantir que só quem tem o código consiga parear
    // true = envia o código de pareamento quando solicitado
    // false = pareamento via QR code no terminal
    pairingCode: {
        enabled: false, // true = ativa o envio do código de pareamento, false = desativa e usa QR code tradicional
        phoneNumber: '', // número usado no pareamento (deixe vazio se não usar)
        customCode: ''       // código personalizado para autenticação (deixe vazio se não usar)
    },

    // MySelf: permite que comandos próprios sejam usados manualmente via WhatsApp
    AllowedCommandSelf: false,

    // SISTEMA DE REGISTRO DE USUÁRIOS PV
    requireRegistration: false, // Exigir registro para usar comandos no PV

    // Modo manutenção completo
    // maintenance: configurações para quando o bot está em manutenção
    // muteGlobalMsg: true  → desativa comandos globalmente, mas ainda permite que o bot envie mensagens automáticas
    //   false → comandos funcionam normalmente
    // allowOwner: dono sempre pode usar comandos, mesmo em manutenção
    // allowAdmins: opcional, permite que admins usem comandos
    // allowList: lista de comandos que continuam funcionando durante manutenção
    // message: mensagem que o bot envia quando alguém tenta usar comandos durante manutenção
    // Observação: diferente do muteGlobal, que ignora comandos sem responder,
    // muteGlobalMsg permite que o bot envie respostas explicando que está em manutenção.
    maintenance: {
        muteGlobalMsg: false,              // true = desativa comandos globalmente
        reason: 'Manutenção programada',    // motivo opcional
        allowOwner: true,                   // dono sempre pode
        allowAdmins: false,                 // permitir admins (opcional)
        allowList: [                        // comandos permitidos durante manutenção
            'ping',
            'debugping',
            'daily', // está na allowList para que os usuários não percam a streak 😬
            'registrar',
            'rg',
            'register',
            'cadastro',
            'cadastrar',
            'lojapix',
            'comprarvip',
            'shoppix',
            'pixshop',
            'store',
            'shop'
        ],
        message: '🛠️ *Modo Manutenção Ativo!*\n\n🚧 Em breve, uma nova atualização estará disponível.\n🔧 Comandos temporariamente desativados enquanto preparamos as melhorias.'
    },

    // Configuração de botões
    // Mode: 'auto' detecta automaticamente whiskeysockets, 'mod' usa fallback genérico, 'baileys' força o formato WB
    // AllowGlobal: permite todos os botões, testado com interação nativa do WhatsApp
    // Observação: futuramente, botões podem falhar ou não aparecer dependendo da versão do WhatsApp.
    // Problemas podem ocorrer com atualizações recentes do app ou do Baileys.
    // Modificações de versão podem funcionar, mas há risco de bugs ou banimentos.
    // AllowInteraction: permite interação dos usuários com os botões
    // AllowListInteraction: permite interação em listas
    // AllowTemplate: permite uso de templates (false desativa)
    // AllowButtons: permite botões individuais
    // AllowStickerPack: permite envio de pacotes de figurinhas via botão
    // AllowAlbum: permite envio de álbuns via botão
    Buttons: {
        Mode: 'auto',
        AllowGlobal: true,
        AllowInteraction: true,
        AllowListInteraction: true,
        AllowTemplate: false,
        AllowButtons: true, 
        AllowStickerPack: true,
        AllowAlbum: true,
    },

    // Configurações de comandos
    // cooldown: tempo mínimo entre execuções de comandos pelo mesmo usuário (em ms)
    // Função: proteção contra spam de comandos, evitando sobrecarga do bot
    commands: {
        cooldown: 3000, // 3 segundos entre comandos para prevenir spam
    },

    // Mensagens padrão para respostas de comandos
    // Configurações para mensagens de erro, sucesso, aviso e informação
    // ownerOnly: mensagem exibida quando um comando é restrito ao proprietário do sistema
    // adminOnly: mensagem exibida quando um comando é restrito a administradores do grupo
    // cargoOnly: mensagem exibida quando um comando é restrito a cargos específicos (Helper, Admin, Dono)
    // groupOnly: mensagem exibida quando um comando é restrito a grupos
    // botNotAdmin: mensagem exibida quando o bot não tem permissões administrativas no grupo
    // banDeniedNotAdmin: mensagem exibida quando um banimento é negado ao não ter permissões administrativas
    messages: {
        // 🔐 Mensagens de Permissões - Tom Profissional
        ownerOnly: '🚫 *Acesso Restrito*\nEste comando requer privilégios de proprietário do sistema.',
        adminOnly: '🔑 *Permissão Insuficiente*\nApenas administradores do grupo podem executar esta ação.',
        cargoOnly: '📊 *Cargo Insuficiente*\nVocê precisa ter um cargo superior (Helper, Admin, Dono) para usar este comando.',
        groupOnly: '👥 *Contexto Inválido*\nEste comando está disponível exclusivamente em grupos.',
        botNotAdmin: '⚙️ *Configuração Necessária*\n> O bot prescisa ser *Administrador* do grupo para executar este comando',
        banDeniedNotAdmin: 'Desculpa voce nao pode banir voce nao esta adm no grupo, seu numero lid mesma no grupo sem cargo admin ficou membros',

        // 🔍 Mensagens de Validação - Tom Informativo
        userNotFound: '👤 *Usuário Não Localizado*\nNão foi possível encontrar o usuário especificado.',
        notInGroup: '📋 *Membro Não Encontrado*\nO usuário especificado não faz parte deste grupo.',

        // ⚠️ Mensagens de Estado - Tom Consultivo
        alreadyAdmin: '✅ *Status Atual*\nO usuário já possui privilégios administrativos neste grupo.',
        notAdmin: 'ℹ️ *Status Atual*\nO usuário não possui privilégios administrativos neste grupo.',
        alreadyMember: '📌 *Membro Existente*\nO usuário já faz parte deste grupo.',

        // ❌ Mensagens de Erro - Tom Técnico Amigável
        error: '⚡ *Erro de Processamento*\nOcorreu uma falha técnica durante a execução. Tente novamente em instantes.',

        // 🧪 Mensagens Beta Features
        beta: '🧪 *Funcionalidade Beta*\nEste recurso está em fase experimental.',
        betaFeature: '🧪 *Recurso em Desenvolvimento*\nEsta funcionalidade está em fase beta e só está disponível para desenvolvedores.',

        // 🚀 Mensagens Adicionais
        commandNotFound: '🔍 *Comando Não Reconhecido*\nO comando solicitado não foi encontrado em nosso sistema.',
        insufficientParams: '📝 *Parâmetros Incompletos*\nEste comando requer informações adicionais para ser executado.',
        cooldownActive: '⏱️ *Limite de Uso Ativo*\nAguarde alguns instantes antes de usar este comando novamente.',
        success: '✨ *Operação Concluída*\nA ação foi executada com sucesso.',
        configUpdated: '⚙️ *Configuração Atualizada*\nAs alterações foram salvas e aplicadas ao grupo.',
        securityBlock: '🛡️ *Bloqueio de Segurança*\nEsta ação foi impedida por medidas de proteção do grupo.'
    },

    // 🔒 MENSAGENS DE COMANDO RESTRITO - Sistema Completo
    // Configurações para mensagens relacionadas a comandos restritos
    // cmdRestrito: mensagem exibida quando um comando é temporariamente indisponível
    // cmdDesativadoManutencao: mensagem exibida quando um comando é desativado durante manutenção
    // cmdBloqueadoSeguranca: mensagem exibida quando um comando é bloqueado por segurança
    // cmdIndisponivel: mensagem exibida quando um comando está indisponível no momento
    // restricoes: mensagem exibida quando um comando é restrito por motivos específicos (manutenção, segurança)

    restrictedMessages: {
    // Mensagem principal para comando desativado pelo dono
        cmdRestrito: '🔒 *Comando Temporariamente Indisponível*\n\nDesculpe, este comando foi desativado pelo proprietário do sistema para manutenção preventiva.\n\n⏰ *Status:* Manutenção em andamento\n🔧 *Motivo:* Melhorias no sistema\n\n💡 Tente novamente mais tarde ou entre em contato com a administração.',

        // Versões alternativas para diferentes contextos
        cmdDesativadoManutencao: '🛠️ *Manutenção Programada*\n\nO comando {comando} está temporariamente desabilitado para atualizações do sistema.\n\n📅 *Previsão:* Em breve\n🔄 *Status:* Aguardando liberação\n\n⚡ Agradecemos sua compreensão!',

        cmdBloqueadoSeguranca: '🛡️ *Bloqueio de Segurança*\n\nEste comando foi restrito por medidas de proteção do sistema.\n\n🔍 *Motivo:* Protocolo de segurança ativo\n⚠️ *Ação:* Comando bloqueado temporariamente\n\n👤 Entre em contato com um administrador para mais informações.',

        cmdIndisponivel: '⚠️ *Serviço Indisponível*\n\nO comando solicitado não está disponível no momento.\n\n🔧 *Situação:* Serviço em manutenção\n📊 *Impacto:* Funcionalidade limitada\n\n💭 Nossa equipe está trabalhando para resolver rapidamente.',

        // Mensagens específicas por tipo de restrição
        restricoes: {
            manutencao: '🔧 *Modo Manutenção*\n\nTodos os comandos estão temporariamente desabilitados para manutenção do sistema.\n\n⏳ *Tempo estimado:* {tempo}\n📋 *Motivo:* {motivo}\n\n🔜 Voltaremos em breve!',

            seguranca: '🚨 *Protocolo de Segurança*\n\nComandos restritos por medidas de proteção ativas.\n\n🔐 *Nível:* Alto\n⚡ *Duração:* Temporária\n\n📞 Entre em contato com a administração se necessário.',

            sobrecarga: '📊 *Sistema Sobrecarregado*\n\nComandos limitados devido ao alto volume de requisições.\n\n⏱️ *Aguarde:* Alguns minutos\n🔄 *Status:* Processando fila\n\n💡 Tente novamente em instantes.',

            atualizacao: '🚀 *Atualização em Progresso*\n\nSistema sendo atualizado com novas funcionalidades.\n\n⬆️ *Tipo:* Melhoria de recursos\n🎯 *Benefício:* Melhor performance\n\n✨ Em breve com novidades!',

            erro: '⚡ *Falha Técnica*\n\nComando temporariamente indisponível devido a erro interno.\n\n🔍 *Status:* Investigando\n📧 *Notificação:* Equipe técnica alertada\n\n🔄 Tentativa automática de correção em andamento.',

            beta: '🧪 *Recurso Beta*\n\nEste comando está em fase experimental.\n\n⚠️ *Aviso:* Podem ocorrer instabilidades\n📝 *Feedback:* Reporte problemas encontrados\n\n🔬 Ajude-nos a melhorar testando!',

            perigo: '🚨 *Alerta de Segurança*\n\nEste comando foi desativado por representar risco potencial.\n\n🛡️ *Motivo:* Vulnerabilidade detectada\n⚠️ *Ação:* Comando bloqueado.'
        },

        // Mensagens personalizáveis com parâmetros
        templates: {
            restricao_personalizada: '🔒 *{titulo}*\n\n{descricao}\n\n📋 *Detalhes:*\n▸ Comando: {comando}\n▸ Motivo: {motivo}\n▸ Duração: {duracao}\n\n{acao_sugerida}',
            manutencao_agendada: '🗓️ *Manutenção Agendada*\n\nO sistema entrará em manutenção {quando}.\n\n⏰ *Início:* {inicio}\n⏱️ *Duração prevista:* {duracao}\n🔧 *Impacto:* {impacto}\n\n💡 Planeje suas atividades considerando este período.',
            volta_funcionamento: '✅ *Sistema Normalizado*\n\nTodos os comandos foram reativados e estão funcionando normalmente.\n\n🔄 *Duração da interrupção:* {duracao}\n🎯 *Melhorias aplicadas:* {melhorias}\n\n🎉 Obrigado pela paciência!'
        },

        statusMessages: {
            // 403 proibido o comandos extremo risco Code: 403
            403: '🔒 *Erro 403 - Comando Restrito*\n\nEste comando foi bloqueado por medidas de segurança.\n\n🛡️ *Motivo:* Acesso não autorizado',

            // serviço indisponível problema o codigo ou falhar critico. Code: 503
            503: '⚠️ *Erro 503 - Serviço Indisponível*\n\nO comando não pode ser executado no momento.\n\n🔧 *Situação:* Manutenção em andamento\n⏳ *Estimativa:* Retorno em breve',

            // muitas tentativas limite excedido o servidor bloquio temporariamente. Code: 429
            429: '🚦 *Erro 429 - Limite Excedido*\n\nMuitas tentativas em pouco tempo detectadas.\n\n⏱️ *Cooldown:* {tempo} segundos\n🔄 *Próxima tentativa:* Após o tempo de espera',

            // Novas atualização o comandos em breve futuro lancamentos Code: 102
            102: '🚀 *Atualização em Progresso*\n\nSistema sendo atualizado com novas funcionalidades.\n\n⬆️ *Tipo:* Melhoria de recursos\n🎯 *Benefício:* Melhor performance\n\n✨ Em breve com novidades!',
        }
    },

    // 🎯 Mensagens contextuais por horário/situação
    contextualRestrictedMessages: {
        horario_comercial: '🕐 *Horário de Atendimento*\n\nAlguns comandos estão disponíveis apenas durante o horário comercial.\n\n⏰ *Disponível:* Segunda a Sexta, 8h às 18h\n📅 *Hoje:* {status_hoje}\n\n⌛ Tente novamente no próximo horário comercial.',
        fim_de_semana: '🎯 *Modo Fim de Semana*\n\nComandos administrativos limitados durante finais de semana.\n\n📅 *Período:* Sábado e Domingo\n🔄 *Retorno:* Segunda-feira\n\n💡 Comandos básicos permanecem ativos.',
        alta_demanda: '🔥 *Período de Alta Demanda*\n\nComandos com restrição devido ao volume elevado de usuários.\n\n📈 *Situação:* Pico de acesso\n⚡ *Medida:* Limitação temporária\n\n⏳ Aguarde alguns minutos para nova tentativa.'
    },

    // Mensagens correspondentes aos códigos
    statusMessages: {
        403: '🔒 *Erro 403 - Comando Restrito*\n\nEste comando foi bloqueado por medidas de segurança.\n\n🛡️ *Motivo:* Acesso não autorizado',
        503: '⚠️ *Erro 503 - Serviço Indisponível*\n\nO comando não pode ser executado no momento.\n\n🔧 *Situação:* Manutenção em andamento\n⏳ *Estimativa:* Retorno em breve',
        429: '🚦 *Erro 429 - Limite Excedido*\n\nMuitas tentativas em pouco tempo detectadas.\n\n⏱️ *Cooldown:* {tempo} segundos\n🔄 *Próxima tentativa:* Após o tempo de espera',
        102: '🚀 *Atualização em Progresso*\n\nSistema sendo atualizado com novas funcionalidades.\n\n⬆️ *Tipo:* Melhoria de recursos\n🎯 *Benefício:* Melhor performance\n\n✨ Em breve com novidades!'
    },

    // Configurações de desenvolvimento
    // Se hotReload estiver ativado:
    // - Inicializa o FileWatcher para monitorar alterações de arquivos
    // - Inicializa HotReload para atualizar o socket do bot automaticamente
    // - Se o HotReload já estiver ativo, apenas atualiza o socket existente
    development: {
        hotReload: true,
        debugMessages: true,
        debugMessagesAll: false
    },

    // FUNÇÃO PRINCIPAL PARA DETECTAR PREFIXOS (COM SUPORTE A FILTRO)
    async getPrefix(message, groupSettings = null) {
    // VERIFICAR MODO DE PREFIXO ÚNICO PRIMEIRO
        if (groupSettings && groupSettings.only_prefix_mode && groupSettings.only_prefix_value) {
            const onlyPrefix = groupSettings.only_prefix_value;
            if (message.startsWith(onlyPrefix)) {
                return onlyPrefix;
            }
            // Se está no modo "apenas um", não verifica outros
            return null;
        }

        // Modo normal - verificar prefixos padrão primeiro
        const defaultPrefix = this.prefixes.find(prefix => message.startsWith(prefix));
        if (defaultPrefix) return defaultPrefix;

        // Verificar prefixos personalizados do grupo (se ativados)
        if (groupSettings && groupSettings.custom_prefixes_enabled && groupSettings.custom_prefixes) {
            try {
                const customPrefixes = JSON.parse(groupSettings.custom_prefixes);
                const customPrefix = customPrefixes.find(prefix => message.startsWith(prefix));
                if (customPrefix) return customPrefix;
            } catch (error) {
                console.error('Erro ao processar prefixos personalizados:', error);
            }
        }
        return null;
    },

    // FUNÇÃO PARA VERIFICAR SE É COMANDO
    async isCommand(message, groupSettings = null) {
        const prefix = await this.getPrefix(message, groupSettings);
        return !!prefix;
    },

    // FUNÇÃO PARA FAZER PARSE DO COMANDO
    async parseCommand(message, groupSettings = null) {
        const prefix = await this.getPrefix(message, groupSettings);
        if (!prefix) return null;

        return {
            prefix,
            command: message.slice(prefix.length).trim()
        };
    },

    // ⏰ CONFIGURAÇÕES DE REINÍCIO AUTOMÁTICO
    // Controlado via variável de ambiente RESTART_SCHEDULE
    // Opções: 'on' (ativo) ou 'off' (desativado)
    // Horário padrão: 01:50 (aviso), 02:00 (restart), 02:01 (retorno online)
    autoRestart: {
        enabled: (process.env.RESTART_SCHEDULE || 'on').toLowerCase() === 'on',
        timezone: 'America/Sao_Paulo',
        schedule: {
            warning: '50 1 * * *',      // ⚠️ Aviso às 01:50
            restart: '0 2 * * *',       // 🔄 Restart às 02:00
            backOnline: '1 2 * * *'     // ✅ Retorno às 02:01
        }
    },

    // 🔇 CONFIGURAÇÃO DE LOGS SILENCIOSOS
    // Desabilita mensagens de debug e avisos desnecessários no console
    // Útil para reduzir spam quando certas integrações não estão configuradas
    silentLogs: {
        mercadoPago: false,          // 🤐 Silencia aviso de Mercado Pago não configurado
        brawlClubsTick: false,       // 🤐 Silencia "BrawlClubs tick start" durante sincronização
    },
};