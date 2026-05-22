// lib/utils/mentionHandler.js
const chalk = require('chalk');

/**
 * ✅ SISTEMA GLOBAL DE GERENCIAMENTO DE MENÇÕES
 * Suporta LID (@lid) e PN (@s.whatsapp.net)
 * CORRIGIDO: Busca participant por múltiplos campos
 */
class MentionHandler {
    /**
     * 🔄 CONVERTER JID → LID usando groupMetadata
     * ✅ CORRIGIDO: Busca por id, lid, phoneNumber, jid, idAlt
     */
    static jidToLid(jid, groupMetadata) {
        if (!jid || !groupMetadata?.participants) return null;

        // Extrair número limpo do JID
        const cleanNumber = jid.split(':')[0].split('@')[0];

        // ✅ ESTRATÉGIA 1: Buscar por todos os campos possíveis
        const participant = groupMetadata.participants.find(p => {
            // Buscar por ID (pode ser JID ou LID)
            if (p.id) {
                const pId = p.id.split('@')[0].split(':')[0];
                if (pId === cleanNumber) return true;
            }

            // Buscar por LID
            if (p.lid) {
                const pLid = p.lid.split('@')[0].split(':')[0];
                if (pLid === cleanNumber) return true;
            }

            // Buscar por phoneNumber (JID completo)
            if (p.phoneNumber) {
                const pPhone = p.phoneNumber.split('@')[0].split(':')[0];
                if (pPhone === cleanNumber) return true;
            }

            // Buscar por jid
            if (p.jid) {
                const pJid = p.jid.split('@')[0].split(':')[0];
                if (pJid === cleanNumber) return true;
            }

            // Buscar por idAlt
            if (p.idAlt) {
                const pIdAlt = p.idAlt.split('@')[0].split(':')[0];
                if (pIdAlt === cleanNumber) return true;
            }

            return false;
        });

        if (!participant) {
            // console.log(chalk.yellow(`[MENTION] ⚠️ Participant não encontrado para JID: ${jid}`));
            return null;
        }

        // ✅ RETORNAR LID (prioridade: lid > id > construir)
        if (participant.lid) return participant.lid;
        if (participant.id && participant.id.includes('@lid')) return participant.id;

        // Fallback: construir LID a partir do número
        return `${cleanNumber}@lid`;
    }

    /**
     * 🔄 CONVERTER LID → JID usando groupMetadata
     * ✅ CORRIGIDO: Busca por múltiplos campos
     */
    static lidToJid(lid, groupMetadata) {
        if (!lid || !groupMetadata?.participants) return null;

        // Limpar LID
        const cleanLid = lid.split('@')[0].split(':')[0];

        // ✅ ESTRATÉGIA: Buscar por todos os campos possíveis
        const participant = groupMetadata.participants.find(p => {
            // Buscar por LID
            if (p.lid) {
                const pLid = p.lid.split('@')[0].split(':')[0];
                if (pLid === cleanLid) return true;
            }

            // Buscar por ID que contenha o número
            if (p.id) {
                const pId = p.id.split('@')[0].split(':')[0];
                if (pId === cleanLid) return true;
            }

            return false;
        });

        if (!participant) {
            // console.log(chalk.yellow(`[MENTION] ⚠️ Participant não encontrado para LID: ${lid}`));
            return null;
        }

        // ✅ RETORNAR JID (prioridade: phoneNumber > jid > idAlt > id)
        if (participant.phoneNumber) return participant.phoneNumber;
        if (participant.jid) return participant.jid;
        if (participant.idAlt) return participant.idAlt;
        if (participant.id && participant.id.includes('@s.whatsapp.net')) return participant.id;

        // Fallback: construir JID
        return `${cleanLid}@s.whatsapp.net`;
    }

    /**
     * 👥 EXTRAIR IDS DOS MEMBROS DO GRUPO (LID + JID)
     */
    static extractGroupMemberIds(groupMetadata) {
        if (!groupMetadata?.participants) return [];

        const ids = [];

        groupMetadata.participants.forEach(p => {
            // Adicionar todos os IDs disponíveis
            if (p.id) ids.push(p.id);
            if (p.lid) ids.push(p.lid);
            if (p.jid) ids.push(p.jid);
            if (p.phoneNumber) ids.push(p.phoneNumber);
            if (p.idAlt) ids.push(p.idAlt);
        });

        // Remover duplicatas
        return [...new Set(ids)];
    }

    /**
     * 🔍 NORMALIZAR ID (LID ou JID)
     */
    static normalizeId(id, groupMetadata = null) {
        if (!id) return null;

        // Se for LID e temos metadata, converter para JID
        if (id.includes('@lid') && groupMetadata) {
            const jid = this.lidToJid(id, groupMetadata);
            return jid || id;
        }

        // Se for JID e grupo usa LID, converter para LID
        if (id.includes('@s.whatsapp.net') && groupMetadata?.addressingMode === 'lid') {
            const lid = this.jidToLid(id, groupMetadata);
            return lid || id;
        }

        return id;
    }

    /**
     * 🔍 FUNÇÃO PRINCIPAL - Encontra todas as menções
     * ✅ CORRIGIDO: Converte JID→LID automaticamente em grupos LID
     */
    static mentionFinder(message, groupMetadata = null) {
        const result = {
            mentioned_ids: [],
            mentioned_ids_formatted: [],
            mentioned_lids: [],
            mentioned_jids: [],
            group_member_ids: [],
            mentions_text: '',
            is_ephemeral: false,
            is_ephemeral_comment: false,
            has_mentions: false,
            first_mention: null,
            mention_count: 0,
            addressing_mode: groupMetadata?.addressingMode || 'pn'
        };

        if (!message?.message) return result;
        let msgContent = message.message;

        // ✅ DETECTAR EPHEMERAL MESSAGE
        if (msgContent.ephemeralMessage) {
            result.is_ephemeral = true;
            msgContent = msgContent.ephemeralMessage.message;
        }

        // ✅ DETECTAR COMMENT MESSAGE
        if (msgContent.commentMessage) {
            result.is_ephemeral_comment = true;
            return this.handleCommentMessage(msgContent.commentMessage, result, groupMetadata);
        }

        // ✅ DETECTAR ENCRYPTED COMMENT MESSAGE
        if (msgContent.encCommentMessage) {
            result.is_ephemeral_comment = true;
            result.mentions_text = '[Comentário Criptografado]';
            return result;
        }

        // ✅ PROCESSAR MENSAGEM NORMAL
        return this.handleNormalMessage(msgContent, result, groupMetadata);
    }

    /**
     * 📝 PROCESSAR MENSAGEM NORMAL
     * ✅ CORRIGIDO: Converte JID→LID automaticamente
     */
    static handleNormalMessage(msgContent, result, groupMetadata) {
        const extendedText = msgContent.extendedTextMessage;
        const context = extendedText?.contextInfo || msgContent.contextInfo;
        const isLidMode = groupMetadata?.addressingMode === 'lid';

        // ✅ MENÇÕES REAIS (context.mentionedJid)
        if (context?.mentionedJid && Array.isArray(context.mentionedJid)) {
            result.mentioned_ids = context.mentionedJid;
            result.has_mentions = true;
            result.mention_count = context.mentionedJid.length;

            // ✅ PROCESSAR CADA MENÇÃO
            context.mentionedJid.forEach(id => {
                if (id.includes('@lid')) {
                    // ═══ JÁ É LID ═══
                    result.mentioned_lids.push(id);
                    result.mentioned_ids_formatted.push(id.split('@')[0]);

                    // Converter LID→JID para consistência
                    if (groupMetadata) {
                        const jid = this.lidToJid(id, groupMetadata);
                        if (jid) result.mentioned_jids.push(jid);
                    }
                } else {
                    // ═══ É JID - CONVERTER PARA LID EM MODO LID ═══
                    result.mentioned_jids.push(id);

                    if (isLidMode && groupMetadata) {
                        const lid = this.jidToLid(id, groupMetadata);
                        if (lid) {
                            result.mentioned_lids.push(lid);
                            result.mentioned_ids_formatted.push(lid.split('@')[0]);
                            // ❌ REMOVIDO: console.log(chalk.green(`[MENTION] ✅ JID→LID: ${id} → ${lid}`));
                        } else {
                            result.mentioned_ids_formatted.push(id.split('@')[0]);
                            // ❌ REMOVIDO: console.log(chalk.red(`[MENTION] ❌ Não encontrou LID para JID: ${id}`));
                        }
                    } else {
                        result.mentioned_ids_formatted.push(id.split('@')[0]);
                    }
                }
            });

            // Definir primeira menção
            result.first_mention = result.mentioned_lids[0] || result.mentioned_jids[0] || result.mentioned_ids[0];
        }

        // ✅ EXTRAIR TEXTO
        let messageText = '';
        if (extendedText?.text) {
            messageText = extendedText.text;
        } else if (msgContent.conversation) {
            messageText = msgContent.conversation;
        }
        result.mentions_text = messageText;

        // ✅ Fallback: Detectar menções via TEXTO quando mentionedJid está vazio
        if (!result.has_mentions && messageText && groupMetadata?.addressingMode === 'lid') {
            const regex = /@(\d{5,})/g;
            let match;
            while ((match = regex.exec(messageText)) !== null) {
                const potentialLid = `${match[1]}@lid`;
                const potentialJid = `${match[1]}@s.whatsapp.net`;

                // Tentar converter
                const lid = this.jidToLid(potentialJid, groupMetadata) || potentialLid;
                const jid = this.lidToJid(lid, groupMetadata) || potentialJid;

                result.mentioned_lids.push(lid);
                result.mentioned_jids.push(jid);
                result.mentioned_ids_formatted.push(match[1]);
            }

            if (result.mentioned_lids.length > 0) {
                result.has_mentions = true;
                result.mention_count = result.mentioned_lids.length;
                result.first_mention = result.mentioned_lids[0];
            }
        }

        // ✅ Adicionar participant se não estiver nas menções
        if (context?.participant && !result.mentioned_ids.includes(context.participant)) {
            result.mentioned_ids.push(context.participant);
            result.mentioned_ids_formatted.push(context.participant.split('@')[0]);
            result.has_mentions = true;
            result.mention_count = result.mentioned_ids.length;
            if (!result.first_mention) result.first_mention = context.participant;
        }

        // Remover duplicatas
        result.mentioned_ids = [...new Set(result.mentioned_ids)];
        result.mentioned_ids_formatted = [...new Set(result.mentioned_ids_formatted)];
        result.mentioned_lids = [...new Set(result.mentioned_lids)];
        result.mentioned_jids = [...new Set(result.mentioned_jids)];

        // Adicionar membros do grupo
        if (groupMetadata) {
            result.group_member_ids = this.extractGroupMemberIds(groupMetadata);
        }

        return result;
    }

    /**
     * 🗨️ PROCESSAR COMMENT MESSAGE
     */
    static handleCommentMessage(commentMessage, result, groupMetadata) {
        const context = commentMessage.contextInfo || {};
        const isLidMode = groupMetadata?.addressingMode === 'lid';

        // Extrair menções do comentário
        if (context.mentionedJid && Array.isArray(context.mentionedJid)) {
            result.mentioned_ids = context.mentionedJid;
            result.has_mentions = true;
            result.mention_count = context.mentionedJid.length;
            result.first_mention = context.mentionedJid[0];

            // Separar LIDs e JIDs
            context.mentionedJid.forEach(id => {
                if (id.includes('@lid')) {
                    result.mentioned_lids.push(id);
                    result.mentioned_ids_formatted.push(id.split('@')[0]);

                    if (groupMetadata) {
                        const jid = this.lidToJid(id, groupMetadata);
                        if (jid) result.mentioned_jids.push(jid);
                    }
                } else {
                    result.mentioned_jids.push(id);

                    // ✅ Converter JID→LID em modo LID
                    if (isLidMode && groupMetadata) {
                        const lid = this.jidToLid(id, groupMetadata);
                        if (lid) {
                            result.mentioned_lids.push(lid);
                            result.mentioned_ids_formatted.push(lid.split('@')[0]);
                        } else {
                            result.mentioned_ids_formatted.push(id.split('@')[0]);
                        }
                    } else {
                        result.mentioned_ids_formatted.push(id.split('@')[0]);
                    }
                }
            });
        }

        // Extrair texto do comentário
        if (commentMessage.message) {
            const innerMsg = commentMessage.message;
            if (innerMsg.conversation) {
                result.mentions_text = innerMsg.conversation;
            } else if (innerMsg.extendedTextMessage?.text) {
                result.mentions_text = innerMsg.extendedTextMessage.text;
            }
        }

        // Adicionar membros do grupo se disponível
        if (groupMetadata) {
            result.group_member_ids = this.extractGroupMemberIds(groupMetadata);
        }

        return result;
    }

    /**
     * 🔍 DETECTAR MENÇÕES EM TEXTO SIMPLES (FALLBACK)
     */
    static detectTextMentions(text, groupMembers = []) {
        if (!text) return [];

        const mentionRegex = /@(\d{10,15})/g;
        const matches = [];
        let match;

        while ((match = mentionRegex.exec(text)) !== null) {
            const jid = `${match[1]}@s.whatsapp.net`;
            const lid = `${match[1]}@lid`;

            // Verificar se é membro do grupo (JID ou LID)
            if (groupMembers.length === 0 ||
                groupMembers.includes(jid) ||
                groupMembers.includes(lid)) {
                matches.push(jid);
            }
        }

        return [...new Set(matches)];
    }

    /**
     * 📋 OBTER LISTA DE JIDS MENCIONADOS (CONVERTIDOS)
     */
    static mentionedJidList(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);
        const isLidMode = groupMetadata?.addressingMode === 'lid';

        // ✅ Em modo LID: retornar apenas @s.whatsapp.net (convertidos)
        if (isLidMode) {
            return result.mentioned_jids.filter(id => id.includes('@s.whatsapp.net'));
        }

        return result.mentioned_ids;
    }

    /**
     * 📋 OBTER LISTA DE LIDS MENCIONADOS
     */
    static mentionedLidList(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);

        // ✅ SEMPRE retornar apenas @lid
        return result.mentioned_lids.filter(id => id.includes('@lid'));
    }

    /**
     * 📱 OBTER LISTA FORMATADA (SÓ NÚMEROS)
     */
    static mentionedJidListFormatted(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);
        const isLidMode = groupMetadata?.addressingMode === 'lid';

        // ✅ Em modo LID: retornar números dos LIDs
        if (isLidMode && result.mentioned_lids.length > 0) {
            return result.mentioned_lids.map(lid => lid.split('@')[0]);
        }

        // ✅ Em modo PN: retornar números dos JIDs
        return result.mentioned_ids_formatted;
    }

    /**
     * 🆔 OBTER APENAS LIDs
     */
    static getMentionedLids(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);
        return result.mentioned_lids;
    }

    /**
     * 📞 OBTER APENAS JIDs/PNs
     */
    static getMentionedJids(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);
        return result.mentioned_jids;
    }

    /**
     * 👥 OBTER IDS DOS MEMBROS DO GRUPO
     */
    static groupMembersId(groupMetadata) {
        return this.extractGroupMemberIds(groupMetadata);
    }

    /**
     * ✅ VERIFICAR SE USUÁRIO FOI MENCIONADO
     */
    static isUserMentioned(message, targetUserId, groupMetadata = null) {
        const mentions = this.mentionedJidList(message, groupMetadata);

        // Verificar tanto LID quanto JID
        const targetLid = this.jidToLid(targetUserId, groupMetadata);

        return mentions.includes(targetUserId) ||
               (targetLid && mentions.includes(targetLid));
    }

    /**
     * 🔢 CONTAR MENÇÕES
     */
    static getMentionCount(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);
        return result.mention_count;
    }

    /**
     * 🎯 OBTER PRIMEIRA MENÇÃO (JID ou LID dependendo do modo)
     */
    static getFirstMention(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);
        return result.first_mention;
    }

    /**
     * 🎯 OBTER PRIMEIRA MENÇÃO (LID)
     */
    static firstMentionLid(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);

        // Prioridade: primeiro LID detectado
        if (result.mentioned_lids.length > 0) {
            return result.mentioned_lids[0];
        }

        // Fallback: converter primeiro JID para LID
        if (result.mentioned_jids.length > 0 && groupMetadata) {
            return this.jidToLid(result.mentioned_jids[0], groupMetadata);
        }

        return null;
    }

    /**
     * 📊 OBTER ESTATÍSTICAS COMPLETAS
     */
    static getMentionStats(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);
        return {
            total_mentions: result.mention_count,
            has_mentions: result.has_mentions,
            is_ephemeral: result.is_ephemeral,
            is_comment: result.is_ephemeral_comment,
            group_members_count: result.group_member_ids.length,
            addressing_mode: result.addressing_mode,
            mention_ratio: result.group_member_ids.length > 0 ?
                (result.mention_count / result.group_member_ids.length * 100).toFixed(1) + '%' : '0%',
            lids_count: result.mentioned_lids.length,
            jids_count: result.mentioned_jids.length
        };
    }

    /**
     * 🔍 OBTER TODOS OS IDENTIFICADORES (PN ou LID)
     */
    static getPNorLID(message, groupMetadata = null) {
        const result = this.mentionFinder(message, groupMetadata);
        const output = [];
        const isLidMode = groupMetadata?.addressingMode === 'lid';

        // PRIORIDADE 1: Menções LID
        if (result.mentioned_lids.length > 0) {
            result.mentioned_lids.forEach(lid => {
                output.push({
                    user: this.lidToJid(lid, groupMetadata) || null,
                    lid
                });
            });
        }
        // PRIORIDADE 2: Menções JID (converter para LID se em modo LID)
        else if (result.mentioned_jids.length > 0) {
            result.mentioned_jids.forEach(jid => {
                if (isLidMode && groupMetadata) {
                    const lid = this.jidToLid(jid, groupMetadata);
                    output.push({
                        user: jid,
                        lid: lid || null
                    });
                } else {
                    output.push({
                        user: jid,
                        lid: `${jid.split('@')[0]}@lid`
                    });
                }
            });
        }
        // PRIORIDADE 3: Remetente (sem menções)
        else {
            if (message.key.participant) {
                // ═══ GRUPO ═══
                const participant = message.key.participant;

                if (participant.includes('@lid')) {
                    output.push({
                        user: this.lidToJid(participant, groupMetadata) || null,
                        lid: participant
                    });
                } else {
                    if (isLidMode && groupMetadata) {
                        const lid = this.jidToLid(participant, groupMetadata);
                        output.push({
                            user: participant,
                            lid: lid || null
                        });
                    } else {
                        output.push({
                            user: participant,
                            lid: `${participant.split('@')[0]}@lid`
                        });
                    }
                }
            } else {
                // ═══ CHAT PRIVADO ═══
                const remoteJid = message.key.remoteJid;

                if (remoteJid.includes('@lid')) {
                    output.push({ user: null, lid: remoteJid });
                } else if (remoteJid.includes('@s.whatsapp.net')) {
                    output.push({ user: remoteJid, lid: null });
                } else {
                    output.push({ user: remoteJid, lid: null });
                }
            }
        }

        return output;
    }

    /**
     * 🔍 OBTER LID DE UMA MENÇÃO (string)
     */
    static getLIDFromMention(mentionText, groupMetadata = null) {
        if (!mentionText) return null;

        let lid = mentionText.includes('@lid') ? mentionText : `${mentionText.replace('@', '')}@lid`;

        if (groupMetadata?.participants) {
            const participant = groupMetadata.participants.find(p =>
                (p.lid || p.id || '').includes(lid)
            );
            if (participant) return participant.lid || participant.id;
            return null;
        }

        return lid;
    }

    /**
     * 🛠️ FUNÇÃO DE DEBUG
     */
    static debugMentions(message, groupMetadata = null) {
        console.log(chalk.cyan('\n🔍 [MENTION DEBUG]:'));
        console.log(chalk.yellow('├─ GroupMetadata:'));
        console.log(JSON.stringify(groupMetadata, null, 2));

        const result = this.mentionFinder(message, groupMetadata);
        console.log(chalk.yellow('├─ Addressing Mode:'), result.addressing_mode);
        console.log(chalk.yellow('├─ Menções (Total):'), result.mention_count);
        console.log(chalk.yellow('├─ Menções (LID):'), result.mentioned_lids);
        console.log(chalk.yellow('├─ Menções (JID):'), result.mentioned_jids);
        console.log(chalk.yellow('├─ Menções (Formatted):'), result.mentioned_ids_formatted);
        console.log(chalk.yellow('├─ É ephemeral:'), result.is_ephemeral);
        console.log(chalk.yellow('├─ É comentário:'), result.is_ephemeral_comment);
        console.log(chalk.yellow('└─ Membros do grupo:'), result.group_member_ids.length);
        return result;
    }
}

module.exports = MentionHandler;
