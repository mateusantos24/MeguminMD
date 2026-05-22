// lib/utils/simpleCache.js
// Cache simples para metadados de grupos, newsletters e blocklist com melhorias + DEBUG

const chalk = require('chalk');

function normalizePN(x) {
    if (!x) return null;
    const s = String(x).toLowerCase();

    // ✅ CORRETO: [0] pega string do array antes do segundo .split()
    const base = s.split('@')[0].split(':')[0];

    // Se é apenas número (7-17 dígitos), adicionar @s.whatsapp.net
    if (/^\d{7,17}$/.test(base)) {
        return `${base}@s.whatsapp.net`;
    }

    // Se já tem @s.whatsapp.net, remover :XX se existir
    if (s.endsWith('@s.whatsapp.net')) {
        return `${s.split(':')[0]}@s.whatsapp.net`;
    }
    return null;
}

function normalizeLID(x) {
    if (!x) return null;
    const s = String(x).toLowerCase();
    // ✅ CORRETO: Verificar @lid ANTES de remover :XX
    if (!s.includes('@lid')) return null;
    // Remover sufixo :XX mantendo @lid
    const base = s.split('@lid')[0].split(':')[0];
    return `${base}@lid`;
}

function makeAdminIndex(participants = []) {
    // Conjuntos de admins por PN e por LID
    const adminJids = new Set();
    const adminLids = new Set();

    // Conjuntos de donos/superadmins por PN e por LID (se aplicável)
    const adminOwnerJids = new Set();
    const adminOwnerLids = new Set();

    // Mapas de conversão somente quando existe PN REAL
    const lidToPN = new Map();
    const pnToLID = new Map();

    for (const p of participants) {
        // Normalizar entradas possíveis
        const rawId = (p?.id || p?.jid || p?.lid || '').toLowerCase();

        // PN preferencialmente de phoneNumber ou p.jid
        const pnFromPhone = p?.phoneNumber ? normalizePN(p.phoneNumber) : null;
        const pnFromJid = p?.jid ? normalizePN(p.jid) : null;
        const pnFromIds = p?.id ? normalizePN(p.id) : null;

        // PN a partir de p.id somente se terminar em @s.whatsapp.net
        const pnFromId = rawId.endsWith('@s.whatsapp.net') ? normalizePN(rawId) : null;

        // Escolher o primeiro PN válido
        const jid = pnFromPhone || pnFromJid|| pnFromIds || pnFromId || null;

        // LID a partir de p.lid ou p.id (com remoção de sufixo :XX preservando @lid)
        const lidFromLid = p?.lid ? normalizeLID(p.lid) : null;
        const lidFromLidIds = p?.id ? normalizeLID(p.id) : null;
        const lidFromId  = rawId ? normalizeLID(rawId) : null;
        const lid = lidFromLid || lidFromLidIds || lidFromId || null;

        // Criar mapeamento LID↔PN somente quando AMBOS existem de forma real
        if (jid && lid) {
            lidToPN.set(lid, jid);
            pnToLID.set(jid, lid);
        }

        // Adicionar aos conjuntos de admins (não depende de existir PN)
        if (p?.admin) {
            if (jid) adminJids.add(jid);
            if (lid) adminLids.add(lid);

            // Tratar dono/superadmin quando presente
            if (p.admin === 'superadmin' || p.admin === 'owner') {
                if (jid) adminOwnerJids.add(jid);
                if (lid) adminOwnerLids.add(lid);
            }
        }
    }

    return {
        adminJids,        // Set de PN admin
        adminLids,        // Set de LID admin
        adminOwnerJids,   // Set de PN donos/superadmins
        adminOwnerLids,   // Set de LID donos/superadmins
        lidToPN,          // Map: LID real -> PN real
        pnToLID           // Map: PN real  -> LID real
    };
}

class SimpleCache {
    constructor() {
        this.groupMetadataCache = new Map();
        this.newsletterMetadataCache = new Map();
        this.communityMetadataCache = new Map(); // ✅ NOVO: Cache para comunidades
        this.blocklistCache = null;
        this.CACHE_TIME = 15 * 1000; // ✅ 15 SEGUNDOS (era 15)
        this.rateLimitFlags = new Map();
        // ✅ NOVO: contador de falhas por JID
        this.failedAttempts = new Map(); // chave: JID, valor: número de falhas
        this.MAX_ATTEMPTS = 3; // máximo de tentativas antes de ignorar
        this.refreshInProgress = new Set(); // ✅ NOVO: Controle de refresh em andamento
        this.pendingFetches = new Map(); // ✅ NOVO: Promises de fetch em andamento para deduplicação
    }


    // Verificar se um JID está sendo chamado repetidamente
    isRateLimited(jid) {
        const count = this.failedAttempts.get(jid) || 0;
        return count >= this.MAX_ATTEMPTS;
    }

    // Incrementar contador de tentativas
    incrementAttempts(jid) {
        const count = this.failedAttempts.get(jid) || 0;
        this.failedAttempts.set(jid, count + 1);

        // Resetar após CACHE_TIME
        setTimeout(() => {
            const c = this.failedAttempts.get(jid) || 0;
            if (c > 0) this.failedAttempts.set(jid, c - 1);
        }, this.CACHE_TIME);
    }

    // Resetar tentativas
    resetAttempts(jid) {
        this.failedAttempts.delete(jid);
    }

    // ✅ DEBUG: Mostrar todas as funções disponíveis do sock
    debugSockFunctions(sock) {

        // Funções de grupo (ok, só organizei e mantive as que existem no seu sock)
        const groupFunctions = [
            'groupQuery',
            'groupMetadata',
            'groupCreate',
            'groupLeave',
            'groupUpdateSubject',
            'groupUpdateDescription',
            'groupInviteCode',
            'groupRevokeInvite',
            'groupAcceptInvite',
            'groupRevokeInviteV4',
            'groupAcceptInviteV4',
            'groupGetInviteInfo',
            'groupToggleEphemeral',
            'groupSettingUpdate',
            'groupMemberAddMode',
            'groupJoinApprovalMode',
            'groupRequestParticipantsList',
            'groupRequestParticipantsUpdate',
            'groupParticipantsUpdate',
            'groupFetchAllParticipating',
        ];

        // Funções de newsletter (atualizadas conforme seu sock)
        const newsletterFunctions = [];

        // ✅ MOSTRAR FUNÇÕES AUSENTES
        const allFunctions = [...groupFunctions, ...newsletterFunctions];
        const missingFunctions = allFunctions.filter(fn => typeof sock[fn] !== 'function');
        if (missingFunctions.length > 0) {
            console.log(chalk.red('❌ FUNÇÕES AUSENTES:'), missingFunctions.join(', '));
        }
    }

    // ✅ NOVO: Invalidar cache quando há mudanças de admin
    invalidateGroupCache(groupJid, reason = 'manual') {
        if (this.groupMetadataCache.has(groupJid)) {
            // console.log(chalk.yellow(`🗑️ Cache invalidado para ${groupJid.split('@')[0]} - Motivo: ${reason}`));
            this.groupMetadataCache.delete(groupJid);
        }
        if (this.communityMetadataCache.has(groupJid)) {
            console.log(chalk.yellow(`🗑️ Cache de comunidade invalidado para ${groupJid.split('@')[0]} - Motivo: ${reason}`));
            this.communityMetadataCache.delete(groupJid);
        }
    }

    // ✅ NOVO: Forçar refresh imediato para operações críticas
    async forceRefreshGroupMetadata(sock, groupJid, reason = 'admin_change') {
        if (this.refreshInProgress.has(groupJid)) return null; // já está sendo feito
        this.refreshInProgress.add(groupJid);

        this.incrementAttempts(groupJid);

        try {
            this.invalidateGroupCache(groupJid, reason);
            let metadata;
            if (groupJid.includes('@g.us')) {
                metadata = await sock.groupMetadata(groupJid);
            } else if (groupJid.includes('@lid')) {
                metadata = await sock.communityMetadata(groupJid);
            }
            metadata.timestamp = Date.now();
            if (metadata.isCommunity || groupJid.includes('@lid')) {
                this.communityMetadataCache.set(groupJid, metadata);
            } else {
                this.groupMetadataCache.set(groupJid, metadata);
            }

            this.resetAttempts(groupJid); // Reset após sucesso
            return metadata;
        } finally {
            this.refreshInProgress.delete(groupJid);
        }
    }


    // ✅ SISTEMA INTELIGENTE - DETECTA TIPO DE JID E USA FUNÇÃO CORRETA
    async getGroupMetadata(sock, groupJid, forceRefresh = false) {
        const now = Date.now();

        // ✅ DEBUG: Mostrar funções disponíveis na primeira execução
        if (!this._debugShown) {
            this.debugSockFunctions(sock);
            this._debugShown = true;
        }

        // ✅ VERIFICAR TIPO DE JID
        if (groupJid.includes('@newsletter')) {
            return this.getNewsletterMetadata(sock, groupJid);
        }

        if (groupJid.includes('@lid')) {
            console.log(chalk.magenta(`[DEBUG] [${groupJid}] - Detectado COMUNIDADE (@lid), usando communityMetadata...`));
            return this.getCommunityMetadata(sock, groupJid, false);
        }

        if (!groupJid.includes('@g.us')) {
            console.log(chalk.yellow(`[SKIP] JID ${groupJid} não é um grupo, newsletter ou comunidade reconhecido`));
            return {};
        }

        // ✅ 1. DEDUPLICAÇÃO DE REQUISIÇÕES (Evita race conditions)
        if (this.pendingFetches.has(groupJid)) {
            // console.log(chalk.gray(`[DEBUG] [${groupJid}] - Aguardando fetch em andamento...`));
            return this.pendingFetches.get(groupJid);
        }

        // ✅ REFRESH FORÇADO (para operações críticas)
        if (forceRefresh) {
            // console.log(chalk.cyan(`[DEBUG] [${groupJid}] - REFRESH FORÇADO solicitado`));
            return this.forceRefreshGroupMetadata(sock, groupJid, false);
        }

        // Verificar cache existente APENAS para grupos normais
        const cached = this.groupMetadataCache.get(groupJid);
        const isExpired = !cached || !cached.timestamp || (now - cached.timestamp > this.CACHE_TIME);

        // ✅ USAR CACHE SE AINDA VÁLIDO
        if (!isExpired) {
            return cached;
        }

        // Rate limiting
        const rateLimitKey = `rateLimit_${groupJid}`;

        if (this.rateLimitFlags.get(rateLimitKey)) {
            return cached || {};
        }

        // ✅ INICIAR FETCH (Promise Wrapper)
        const fetchPromise = (async () => {
            try {
                // console.log(chalk.blue(`[DEBUG] [${groupJid}] - Buscando metadado do GRUPO...`));

                // ✅ USAR groupMetadata PARA GRUPOS NORMAIS
                const metadata = await sock.groupMetadata(groupJid).catch(() => ({}));
                // console.log('Metadata GP:', JSON.stringify(metadata, null, 2));

                // ✅ VERIFICAR SE É COMUNIDADE DISFARÇADA
                if (metadata.isCommunity) {
                    // Tentar buscar com communityMetadata também
                    if (typeof sock.communityMetadata === 'function') {
                        try {
                            const communityData = await sock.communityMetadata(groupJid).catch(() => ({}));
                            // console.log('CommunityData:', JSON.stringify(communityData, null, 2));

                            // Mesclar dados da comunidade
                            Object.assign(metadata, communityData);
                        } catch (err) {
                            console.log(chalk.yellow(`[DEBUG] Não foi possível buscar dados extras da comunidade: ${err.message}`));
                        }
                    }
                }

                metadata.timestamp = Date.now();

                // Salvar no cache apropriado
                if (metadata.isCommunity) {
                    this.communityMetadataCache.set(groupJid, metadata);
                } else {
                    this.groupMetadataCache.set(groupJid, metadata);
                }
                return metadata;

            } catch (err) {
                console.error(chalk.red(`[ERRO] Falha ao buscar metadado do grupo: ${err}`));
                // Ativar rate limit em caso de erro
                this.rateLimitFlags.set(rateLimitKey, true);
                setTimeout(() => {
                    this.rateLimitFlags.delete(rateLimitKey);
                }, this.CACHE_TIME);
                return cached || {};
            } finally {
                // Remover da lista de pendentes
                this.pendingFetches.delete(groupJid);
            }
        })();

        this.pendingFetches.set(groupJid, fetchPromise);
        return fetchPromise;
    }

    // ✅ NOVA FUNÇÃO ESPECÍFICA PARA COMUNIDADES
    async getCommunityMetadata(sock, communityJid, forceRefresh = false) {
        const now = Date.now();

        // ✅ REFRESH FORÇADO
        if (forceRefresh) {
            console.log(chalk.magenta(`[DEBUG] [${communityJid}] - REFRESH FORÇADO para comunidade`));
            return this.forceRefreshGroupMetadata(sock, communityJid, 'community_force_requested');
        }

        // ✅ 1. DEDUPLICAÇÃO DE REQUISIÇÕES
        if (this.pendingFetches.has(communityJid)) {
            return this.pendingFetches.get(communityJid);
        }

        // Verificar cache existente
        const cached = this.communityMetadataCache.get(communityJid);
        const isExpired = !cached || !cached.timestamp || (now - cached.timestamp > this.CACHE_TIME);

        // ✅ USAR CACHE SE AINDA VÁLIDO
        if (!isExpired) {
            return cached;
        }

        // Rate limiting
        const rateLimitKey = `rateLimit_community_${communityJid}`;
        if (this.rateLimitFlags.get(rateLimitKey)) {
            return cached || {};
        }

        // ✅ INICIAR FETCH
        const fetchPromise = (async () => {
            try {
                console.log(chalk.magenta(`[DEBUG] [${communityJid}] - Buscando metadado da COMUNIDADE...`));

                // ✅ USAR communityMetadata PARA COMUNIDADES
                if (typeof sock.communityMetadata !== 'function') {
                    console.log(chalk.red(`[ERRO] Função communityMetadata não disponível, usando groupMetadata`));
                    const metadata = await sock.groupMetadata(communityJid).catch(() => ({}));
                    metadata.timestamp = Date.now();
                    this.communityMetadataCache.set(communityJid, metadata);
                    return metadata;
                }

                const metadata = await sock.communityMetadata(communityJid).catch(() => ({}));
                metadata.timestamp = Date.now();
                metadata.isCommunity = true; // Forçar flag

                // Salvar no cache
                this.communityMetadataCache.set(communityJid, metadata);
                return metadata;
            } catch (err) {
                console.error(chalk.red(`[ERRO] Falha ao buscar metadado da comunidade: ${err}`));
                this.rateLimitFlags.set(rateLimitKey, true);
                setTimeout(() => {
                    this.rateLimitFlags.delete(rateLimitKey);
                }, this.CACHE_TIME);
                return cached || {};
            } finally {
                this.pendingFetches.delete(communityJid);
            }
        })();

        this.pendingFetches.set(communityJid, fetchPromise);
        return fetchPromise;
    }

    // ✅ NOVA FUNÇÃO PARA NEWSLETTERS/CANAIS
    async getNewsletterMetadata(sock, newsletterJid) {
        const now = Date.now();

        // ✅ 1. DEDUPLICAÇÃO
        if (this.pendingFetches.has(newsletterJid)) {
            return this.pendingFetches.get(newsletterJid);
        }

        // Verificar cache existente
        const cached = this.newsletterMetadataCache.get(newsletterJid);
        const isExpired = !cached || !cached.timestamp || (now - cached.timestamp > this.CACHE_TIME);

        // ✅ USAR CACHE SE AINDA VÁLIDO
        if (!isExpired) {
            return cached;
        }

        // Rate limiting
        const rateLimitKey = `rateLimit_newsletter_${newsletterJid}`;
        if (this.rateLimitFlags.get(rateLimitKey)) {
            return cached || {};
        }

        // ✅ INICIAR FETCH
        const fetchPromise = (async () => {
            try {
                // ✅ VERIFICAR SE FUNÇÃO EXISTE
                if (typeof sock.newsletterMetadata !== 'function') {
                    console.log(chalk.red(`[ERRO] Função newsletterMetadata não disponível`));
                    return cached ? cached : {};
                }

                // ✅ USAR newsletterMetadata PARA NEWSLETTERS
                const metadata = await sock.newsletterMetadata("jid", newsletterJid).catch(() => ({}));
                // console.log('NewsLetter:', JSON.stringify(metadata, null, 2));
                metadata.timestamp = Date.now();

                // Salvar no cache
                this.newsletterMetadataCache.set(newsletterJid, metadata);
                return metadata;
            } catch (err) {
                console.error(chalk.red(`[ERRO] Falha ao buscar metadado do newsletter: ${err}`));
                this.rateLimitFlags.set(rateLimitKey, true);
                setTimeout(() => {
                    this.rateLimitFlags.delete(rateLimitKey);
                }, this.CACHE_TIME);
                return cached || {};
            } finally {
                this.pendingFetches.delete(newsletterJid);
            }
        })();

        this.pendingFetches.set(newsletterJid, fetchPromise);
        return fetchPromise;
    }

    // ✅ DETECÇÃO INTELIGENTE DE PERMISSÕES
    canInteractWithNewsletter(sock, newsletterJid, metadata) {
        const viewerRole = metadata?.viewer_metadata?.role;
        const isMuted = metadata?.viewer_metadata?.mute === 'ON';

        // Verificar papel do bot no newsletter
        const permissions = {
            canSend: viewerRole === 'ADMIN' || viewerRole === 'OWNER',
            canReact: viewerRole !== 'BANNED' && !isMuted,
            canView: true,
            isMuted,
            role: viewerRole || 'SUBSCRIBER',
            state: metadata?.state || 'UNKNOWN'
        };
        return permissions;
    }

    // ✅ NOVA FUNÇÃO PARA BLOCKLIST COM CACHE
    async getBlocklist(sock) {
        const now = Date.now();

        // Cache blocklist por 5 minutos (muda menos frequentemente)
        const BLOCKLIST_CACHE_TIME = 5 * 60 * 1000;

        if (!this.blocklistCache || (now - this.blocklistCache.timestamp > BLOCKLIST_CACHE_TIME)) {
            try {
                console.log(chalk.magenta('[DEBUG] Buscando blocklist...'));

                const blocklist = await sock.fetchBlocklist().catch(() => []);

                this.blocklistCache = {
                    data: blocklist,
                    timestamp: now
                };

                console.log(chalk.magenta(`[DEBUG] Blocklist obtida: ${blocklist.length} contatos bloqueados`));
                return blocklist;
            } catch (err) {
                console.error(chalk.red(`[ERRO] Falha ao buscar blocklist: ${err}`));
                return this.blocklistCache ? this.blocklistCache.data : [];
            }
        }

        return this.blocklistCache.data;
    }

    // ✅ ADICIONAR SUPORTE A COMUNIDADES NO SIMPLECACHE
    getGroupInfo(metadata, jidType = 'group') {
        if (!metadata) {
            return { participants: [], admins: [], adminLids: [], isValidGroup: false, type: 'unknown' };
        }

        if (jidType === 'community') {
            const participants = metadata.participants || [];
            const { adminJids, adminLids, adminOwnerJids, adminOwnerLids, lidToPN, pnToLID } = makeAdminIndex(participants);

            return {
                participants,
                admins: Array.from(adminJids),
                adminLids: Array.from(adminLids),
                adminOwners: Array.from(adminOwnerJids),
                adminOwnersLids: Array.from(adminOwnerLids),
                lidToPN,
                pnToLID,
                isValidGroup: true,
                type: 'community',
                id: metadata.id,
                addressingMode: metadata.addressingMode || '',
                subject: metadata.subject,
                subjectOwner: metadata.subjectOwner || '',
                subjectOwnerJid: metadata.subjectOwnerJid || '',
                subjectTime: metadata.subjectTime || null,
                size: metadata.size || participants.length || 0,
                creation: metadata.creation || null,
                owner: metadata.owner || '',
                ownerJid: metadata.ownerJid || '',
                owner_country_code: metadata.owner_country_code || '',
                descTime: metadata.descTime || '',
                linkedParent: metadata.linkedParent || '',
                restrict: metadata.restrict || false,
                announce: metadata.announce || false,
                isCommunity: metadata.isCommunity || false,
                isCommunityAnnounce: metadata.isCommunityAnnounce || false,
                joinApprovalMode: metadata.joinApprovalMode || false,
                memberAddMode: metadata.memberAddMode || false,
                timestamp: metadata.timestamp
            };
        }

        if (jidType === 'newsletter') {
            return {
                participants: [],
                admins: [],
                adminLids: [],
                isValidGroup: true,
                type: 'newsletter',
                id: metadata.id,
                state: metadata.state || 'ACTIVE',
                creation_time: metadata.creation_time,
                name: metadata.name || 'Newsletter',
                nameTime: metadata.nameTime,
                description: metadata.description || '',
                descriptionTime: metadata.descriptionTime,
                invite: metadata.invite,
                handle: metadata.handle,
                picture: metadata.picture,
                preview: metadata.preview,
                reaction_codes: metadata.reaction_codes,
                subscribers: metadata.subscribers || 0,
                verification: metadata.verification || 'UNVERIFIED',
                viewer_metadata: metadata.viewer_metadata || {},
                timestamp: metadata.timestamp
            };
        }

        // Grupos normais
        const participants = metadata.participants || [];
        const { adminJids, adminLids, adminOwnerJids, adminOwnerLids, lidToPN, pnToLID } = makeAdminIndex(participants);

        return {
            participants,
            desc: metadata.desc || '',
            admins: Array.from(adminJids),
            adminLids: Array.from(adminLids),
            adminOwners: Array.from(adminOwnerJids),
            adminOwnersLids: Array.from(adminOwnerLids),
            lidToPN,
            pnToLID,
            isValidGroup: true,
            type: 'group',
            id: metadata.id,
            addressingMode: metadata.addressingMode || '',
            subject: metadata.subject || '',
            subjectOwner: metadata.subjectOwner || '',
            subjectOwnerJid: metadata.subjectOwnerJid || '',
            subjectTime: metadata.subjectTime || null,
            size: metadata.size || participants.length || 0,
            creation: metadata.creation || null,
            owner: metadata.owner || '',
            ownerJid: metadata.ownerJid || '',
            owner_country_code: metadata.owner_country_code || '',
            descId: metadata.descId || '',
            descOwner: metadata.descOwner || '',
            descOwnerJid: metadata.descOwnerJid || '',
            descTime: metadata.descTime || null,
            restrict: metadata.restrict || false,
            announce: metadata.announce || false,
            isCommunity: metadata.isCommunity || false,
            isCommunityAnnounce: metadata.isCommunityAnnounce || false,
            joinApprovalMode: metadata.joinApprovalMode || false,
            memberAddMode: metadata.memberAddMode || false,
            timestamp: metadata.timestamp
        };
    }

    // ✅ VERIFICAR SE USUÁRIO É ADMIN
    isUserAdmin(userIdOrJid, groupInfo, userLid = null) {
        // Validação null
        if (!userIdOrJid && !userLid) return false;
        if (groupInfo.type === 'newsletter') {
            const role = String(groupInfo?.viewer_metadata?.role || '').toUpperCase();
            return role === 'ADMIN' || role === 'OWNER';
        }

        const admins = new Set((groupInfo.admins || []).map(x => String(x).toLowerCase()));
        const adminLids = new Set((groupInfo.adminLids || []).map(x => String(x).toLowerCase()));

        const jid = normalizePN(userIdOrJid);
        const lid = normalizeLID(userLid) || normalizeLID(userIdOrJid);

        // ✅ SIMPLIFICAR: Verificação direta
        const isAdmin = (jid && admins.has(jid)) || (lid && adminLids.has(lid));

        // ✅ MELHORAR LOG: Mostrar como foi detectado
        if (isAdmin) {
            jid && admins.has(jid) ? 'PN' : 'LID';
        }
        return isAdmin;
    }

    // ✅ VERIFICAR SE BOT É ADMIN
    isBotAdmin(botIdOrJid, groupInfo, botLid = null) {
        // Validação null
        if (!botIdOrJid && !botLid) return false;
        if (groupInfo.type === 'newsletter') {
            const role = String(groupInfo?.viewer_metadata?.role || '').toUpperCase();
            return role === 'ADMIN' || role === 'OWNER';
        }

        const jid = normalizePN(botIdOrJid);
        const lid = normalizeLID(botLid) || normalizeLID(botIdOrJid);

        const admins = new Set((groupInfo.admins || []).map(x => String(x).toLowerCase()));
        const adminLids = new Set((groupInfo.adminLids || []).map(x => String(x).toLowerCase()));

        // Verificação direta
        const isBotAdmin = (jid && admins.has(jid)) || (lid && adminLids.has(lid));

        // Log melhorado
        if (isBotAdmin) {
            jid && admins.has(jid) ? 'PN' : 'LID';
        }
        return isBotAdmin;
    }


    // ✅ VERIFICAR SE USUÁRIO É DONO
    isUserDono(userIdOrJid, groupInfo, userLid = null) {
        // ✅ NOVO: Validação para null
        if (!userIdOrJid && !userLid) return false;
        if (groupInfo.type === 'newsletter') {
            const role = String(groupInfo?.viewer_metadata?.role || '').toUpperCase();
            return role === 'OWNER';
        }

        const jid = normalizePN(userIdOrJid);
        const lid = normalizeLID(userLid) || normalizeLID(userIdOrJid);

        // Verificar dono padrão
        const isOwnerJid = jid && groupInfo.ownerJid && jid === normalizePN(groupInfo.ownerJid);
        const isOwnerLid = lid && groupInfo.owner && lid === normalizeLID(groupInfo.owner);

        // Verificar dono de comunidade (subjectOwner / subjectOwnerJid)
        const isSubjectOwnerJid = jid && groupInfo.subjectOwnerJid && jid === normalizePN(groupInfo.subjectOwnerJid);
        const isSubjectOwnerLid = lid && groupInfo.subjectOwner && lid === normalizeLID(groupInfo.subjectOwner);

        const isDono = isOwnerJid || isOwnerLid || isSubjectOwnerJid || isSubjectOwnerLid;
        return isDono;
    }

    // ✅ VERIFICAR SE USUÁRIO ESTÁ BLOQUEADO
    async isUserBlocked(sock, userId) {
        const blocklist = await this.getBlocklist(sock);
        const isBlocked = blocklist.includes(userId);
        return isBlocked;
    }

    // ✅ LIMPAR CACHE EXPIRADO
    clearExpiredCache() {
        const now = Date.now();

        // Limpar cache de grupos
        for (const [key, value] of this.groupMetadataCache.entries()) {
            if (value.timestamp && (now - value.timestamp > this.CACHE_TIME * 4)) {
                this.groupMetadataCache.delete(key);
            }
        }

        // Limpar cache de newsletters
        for (const [key, value] of this.newsletterMetadataCache.entries()) {
            if (value.timestamp && (now - value.timestamp > this.CACHE_TIME * 4)) {
                this.newsletterMetadataCache.delete(key);
            }
        }

        // Limpar cache de comunidades
        for (const [key, value] of this.communityMetadataCache.entries()) {
            if (value.timestamp && (now - value.timestamp > this.CACHE_TIME * 4)) {
                this.communityMetadataCache.delete(key);
            }
        }

        console.log(chalk.green(`🧹 Cache limpo: ${this.groupMetadataCache.size} grupos, ${this.newsletterMetadataCache.size} newsletters, ${this.communityMetadataCache.size} comunidades em cache`));
    }

    // ✅ NOVA FUNÇÃO: Obter informações detalhadas do cache de um grupo específico
    getInfo(groupJid) {
        // Garantir que groupJid seja uma string
        if (!groupJid || typeof groupJid !== 'string') {
            return {
                error: true,
                message: 'JID inválido ou não informado.',
                jid: groupJid
            };
        }

        const now = Date.now();

        // Verificar tipo de JID
        const isNewsletter = groupJid.includes('@newsletter');
        const isGroup = groupJid.includes('@g.us');
        const isCommunity = groupJid.includes('@lid');

        if (!isNewsletter && !isGroup && !isCommunity) {
            return {
                error: true,
                message: 'JID inválido. Use um JID de grupo (@g.us), newsletter (@newsletter) ou comunidade (@lid)',
                jid: groupJid
            };
        }

        // Buscar no cache apropriado
        let cached = null;
        let cacheType = 'unknown';
        let cacheSource = null;

        if (isNewsletter) {
            cached = this.newsletterMetadataCache.get(groupJid);
            cacheType = 'newsletter';
            cacheSource = 'newsletterMetadataCache';
        } else if (isCommunity) {
            cached = this.communityMetadataCache.get(groupJid);
            cacheType = 'community';
            cacheSource = 'communityMetadataCache';
        } else {
            cached = this.groupMetadataCache.get(groupJid);
            cacheType = cached?.isCommunity ? 'community' : 'group';
            cacheSource = 'groupMetadataCache';
        }

        // Se não existe no cache
        if (!cached) {
            return {
                error: false,
                cached: false,
                message: 'Grupo/Newsletter/Comunidade não encontrado no cache',
                jid: groupJid,
                cacheType,
                cacheSource,
                nextRefresh: 'Será buscado na próxima interação'
            };
        }

        // Calcular tempo de cache
        const cacheAge = cached.timestamp ? now - cached.timestamp : null;
        const cacheAgeSeconds = cacheAge ? Math.floor(cacheAge / 1000) : null;
        const isExpired = cacheAge > this.CACHE_TIME;
        const timeUntilExpiry = isExpired ? 0 : Math.floor((this.CACHE_TIME - cacheAge) / 1000);

        // Informações básicas
        const basicInfo = {
            jid: groupJid,
            cached: true,
            cacheType,
            cacheSource,
            cacheAge: cacheAgeSeconds ? `${cacheAgeSeconds}s` : 'N/A',
            cacheExpired: isExpired,
            timeUntilExpiry: isExpired ? 'Expirado' : `${timeUntilExpiry}s`,
            cacheTime: `${this.CACHE_TIME / 1000}s`,
            timestamp: cached.timestamp ? new Date(cached.timestamp).toLocaleString('pt-BR') : 'N/A'
        };

        // Informações específicas por tipo
        if (cacheType === 'newsletter') {
            return {
                ...basicInfo,
                name: cached.name || 'N/A',
                description: cached.description || 'N/A',
                subscribersCount: cached.subscribers_count || 0,
                viewerRole: cached.viewer_metadata?.role || 'SUBSCRIBER',
                canSend: cached.viewer_metadata?.role === 'ADMIN' || cached.viewer_metadata?.role === 'OWNER',
                state: cached.state || 'ACTIVE',
                verification: cached.verification || 'UNVERIFIED',
                rawMetadata: cached
            };
        }

        // Grupos e Comunidades
        const participants = cached.participants || [];
        const { adminJids, adminLids, adminOwnerJids, adminOwnerLids } = makeAdminIndex(participants);

        return {
            ...basicInfo,
            id: cached.id || groupJid,
            subject: cached.subject || 'N/A',
            description: cached.desc || 'Sem descrição',
            size: cached.size || participants.length || 0,
            participantsCount: participants.length,
            adminsCount: adminJids.size + adminLids.size,
            adminLidsCount: adminLids.size,
            ownersCount: adminOwnerJids.size + adminOwnerLids.size,
            creation: cached.creation ? new Date(cached.creation * 1000).toLocaleString('pt-BR') : 'N/A',
            owner: cached.ownerJid || cached.owner || 'N/A',
            addressingMode: cached.addressingMode || 'pn',
            isCommunity: cached.isCommunity || false,
            isCommunityAnnounce: cached.isCommunityAnnounce || false,
            restrict: cached.restrict || false,
            announce: cached.announce || false,
            joinApprovalMode: cached.joinApprovalMode || false,
            memberAddMode: cached.memberAddMode || false,
            linkedParent: cached.linkedParent || null,
            admins: Array.from(adminJids),
            adminLids: Array.from(adminLids),
            owners: Array.from(adminOwnerJids),
            ownerLids: Array.from(adminOwnerLids),
            rawMetadata: cached
        };
    }

    // ✅ ESTATÍSTICAS DETALHADAS
    getStats() {
        const stats = {
            cachedGroups: this.groupMetadataCache.size,
            cachedNewsletters: this.newsletterMetadataCache.size,
            cachedCommunities: this.communityMetadataCache.size,
            activeRateLimits: this.rateLimitFlags.size,
            cacheTime: this.CACHE_TIME,
            blocklistCached: !!this.blocklistCache
        };

        // console.log(chalk.cyan('[DEBUG] Cache Stats:'), stats);
        return stats;
    }
}

module.exports = new SimpleCache();
