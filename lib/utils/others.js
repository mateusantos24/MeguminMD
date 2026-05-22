// lib/utils/others.js
const moment = require('moment');
require('moment/locale/pt-br');
moment.locale('pt-br');

// Tipo detalhado da mensagem
/**
 * @param {{ messageStubType: string | number; message: { ephemeralMessage: { message: any; }; }; newsletter: any; key: { remoteJid: string | string[]; }; }} msg
 */
function getDetailedMessageType(msg) {
    if (msg.messageStubType) {
        const stubTypes = {
            0: 'UNKNOWN',
            1: 'REVOKE',
            2: 'CIPHERTEXT',
            3: 'FUTUREPROOF',
            4: 'NON_VERIFIED_TRANSITION',
            5: 'UNVERIFIED_TRANSITION',
            6: 'VERIFIED_TRANSITION',
            7: 'VERIFIED_LOW_UNKNOWN',
            8: 'VERIFIED_HIGH',
            9: 'VERIFIED_INITIAL_UNKNOWN',
            10: 'VERIFIED_INITIAL_LOW',
            11: 'VERIFIED_INITIAL_HIGH',
            12: 'VERIFIED_TRANSITION_ANY_TO_NONE',
            13: 'VERIFIED_TRANSITION_ANY_TO_HIGH',
            14: 'VERIFIED_TRANSITION_HIGH_TO_LOW',
            15: 'VERIFIED_TRANSITION_HIGH_TO_UNKNOWN',
            16: 'VERIFIED_TRANSITION_UNKNOWN_TO_LOW',
            17: 'VERIFIED_TRANSITION_LOW_TO_UNKNOWN',
            18: 'VERIFIED_TRANSITION_NONE_TO_LOW',
            19: 'VERIFIED_TRANSITION_NONE_TO_UNKNOWN',
            20: 'GROUP_CREATE',
            21: 'GROUP_CHANGE_SUBJECT',
            22: 'GROUP_CHANGE_ICON',
            23: 'GROUP_CHANGE_INVITE_LINK',
            24: 'GROUP_CHANGE_DESCRIPTION',
            25: 'GROUP_CHANGE_RESTRICT',
            26: 'GROUP_CHANGE_ANNOUNCE',
            27: 'GROUP_PARTICIPANT_ADD',
            28: 'GROUP_PARTICIPANT_REMOVE',
            29: 'GROUP_PARTICIPANT_PROMOTE',
            30: 'GROUP_PARTICIPANT_DEMOTE',
            31: 'GROUP_PARTICIPANT_INVITE',
            32: 'GROUP_PARTICIPANT_LEAVE',
            33: 'GROUP_PARTICIPANT_CHANGE_NUMBER',
            34: 'BROADCAST_CREATE',
            35: 'BROADCAST_ADD',
            36: 'BROADCAST_REMOVE',
            37: 'GENERIC_NOTIFICATION',
            38: 'E2E_IDENTITY_CHANGED',
            39: 'E2E_ENCRYPTED',
            40: 'CALL_MISSED_VOICE',
            41: 'CALL_MISSED_VIDEO',
            42: 'INDIVIDUAL_CHANGE_NUMBER',
            43: 'GROUP_DELETE',
            44: 'GROUP_ANNOUNCE_MODE_MESSAGE_BOUNCE',
            45: 'CALL_MISSED_GROUP_VOICE',
            46: 'CALL_MISSED_GROUP_VIDEO',
            47: 'PAYMENT_CIPHERTEXT',
            48: 'PAYMENT_FUTUREPROOF',
            49: 'PAYMENT_TRANSACTION_STATUS_UPDATE_FAILED',
            50: 'PAYMENT_TRANSACTION_STATUS_UPDATE_REFUNDED',
            51: 'PAYMENT_TRANSACTION_STATUS_UPDATE_REFUND_FAILED',
            52: 'PAYMENT_TRANSACTION_STATUS_RECEIVER_PENDING_SETUP',
            53: 'PAYMENT_TRANSACTION_STATUS_RECEIVER_SUCCESS_AFTER_HICCUP',
            54: 'PAYMENT_ACTION_ACCOUNT_SETUP_REMINDER',
            55: 'PAYMENT_ACTION_SEND_PAYMENT_REMINDER',
            56: 'PAYMENT_ACTION_SEND_PAYMENT_INVITATION',
            57: 'PAYMENT_ACTION_REQUEST_DECLINED',
            58: 'PAYMENT_ACTION_REQUEST_EXPIRED',
            59: 'PAYMENT_ACTION_REQUEST_CANCELLED',
            60: 'BIZ_VERIFIED_TRANSITION_TOP_TO_BOTTOM',
            61: 'BIZ_VERIFIED_TRANSITION_BOTTOM_TO_TOP',
            62: 'BIZ_INTRO_TOP',
            63: 'BIZ_INTRO_BOTTOM',
            64: 'BIZ_NAME_CHANGE',
            65: 'BIZ_MOVE_TO_CONSUMER_APP',
            66: 'BIZ_TWO_TIER_MIGRATION_TOP',
            67: 'BIZ_TWO_TIER_MIGRATION_BOTTOM',
            68: 'OVERSIZED',
            69: 'GROUP_CHANGE_NO_FREQUENTLY_FORWARDED',
            70: 'GROUP_V4_ADD_INVITE_SENT',
            71: 'GROUP_PARTICIPANT_ADD_REQUEST_JOIN',
            72: 'CHANGE_EPHEMERAL_SETTING',
            73: 'E2E_DEVICE_CHANGED',
            74: 'VIEWED_ONCE',
            75: 'E2E_ENCRYPTED_NOW',
            76: 'BLUE_MSG_BSP_FB_TO_BSP_PREMISE',
            77: 'BLUE_MSG_BSP_FB_TO_SELF_FB',
            78: 'BLUE_MSG_BSP_FB_TO_SELF_PREMISE',
            79: 'BLUE_MSG_BSP_FB_UNVERIFIED',
            80: 'BLUE_MSG_BSP_FB_UNVERIFIED_TO_SELF_PREMISE_VERIFIED',
            81: 'BLUE_MSG_BSP_FB_VERIFIED',
            82: 'BLUE_MSG_BSP_FB_VERIFIED_TO_SELF_PREMISE_UNVERIFIED',
            83: 'BLUE_MSG_BSP_PREMISE_TO_SELF_PREMISE',
            84: 'BLUE_MSG_BSP_PREMISE_UNVERIFIED',
            85: 'BLUE_MSG_BSP_PREMISE_UNVERIFIED_TO_SELF_PREMISE_VERIFIED',
            86: 'BLUE_MSG_BSP_PREMISE_VERIFIED',
            87: 'BLUE_MSG_BSP_PREMISE_VERIFIED_TO_SELF_PREMISE_UNVERIFIED',
            88: 'BLUE_MSG_CONSUMER_TO_BSP_FB_UNVERIFIED',
            89: 'BLUE_MSG_CONSUMER_TO_BSP_PREMISE_UNVERIFIED',
            90: 'BLUE_MSG_CONSUMER_TO_SELF_FB_UNVERIFIED',
            91: 'BLUE_MSG_CONSUMER_TO_SELF_PREMISE_UNVERIFIED',
            92: 'BLUE_MSG_SELF_FB_TO_BSP_PREMISE',
            93: 'BLUE_MSG_SELF_FB_TO_SELF_PREMISE',
            94: 'BLUE_MSG_SELF_FB_UNVERIFIED',
            95: 'BLUE_MSG_SELF_FB_UNVERIFIED_TO_SELF_PREMISE_VERIFIED',
            96: 'BLUE_MSG_SELF_FB_VERIFIED',
            97: 'BLUE_MSG_SELF_FB_VERIFIED_TO_SELF_PREMISE_UNVERIFIED',
            98: 'BLUE_MSG_SELF_PREMISE_TO_BSP_PREMISE',
            99: 'BLUE_MSG_SELF_PREMISE_UNVERIFIED',
            100: 'BLUE_MSG_SELF_PREMISE_VERIFIED',
            101: 'BLUE_MSG_TO_BSP_FB',
            102: 'BLUE_MSG_TO_CONSUMER',
            103: 'BLUE_MSG_TO_SELF_FB',
            104: 'BLUE_MSG_UNVERIFIED_TO_BSP_FB_VERIFIED',
            105: 'BLUE_MSG_UNVERIFIED_TO_BSP_PREMISE_VERIFIED',
            106: 'BLUE_MSG_UNVERIFIED_TO_SELF_FB_VERIFIED',
            107: 'BLUE_MSG_UNVERIFIED_TO_VERIFIED',
            108: 'BLUE_MSG_VERIFIED_TO_BSP_FB_UNVERIFIED',
            109: 'BLUE_MSG_VERIFIED_TO_BSP_PREMISE_UNVERIFIED',
            110: 'BLUE_MSG_VERIFIED_TO_SELF_FB_UNVERIFIED',
            111: 'BLUE_MSG_VERIFIED_TO_UNVERIFIED',
            112: 'BLUE_MSG_BSP_FB_UNVERIFIED_TO_BSP_PREMISE_VERIFIED',
            113: 'BLUE_MSG_BSP_FB_UNVERIFIED_TO_SELF_FB_VERIFIED',
            114: 'BLUE_MSG_BSP_FB_VERIFIED_TO_BSP_PREMISE_UNVERIFIED',
            115: 'BLUE_MSG_BSP_FB_VERIFIED_TO_SELF_FB_UNVERIFIED',
            116: 'BLUE_MSG_SELF_FB_UNVERIFIED_TO_BSP_PREMISE_VERIFIED',
            117: 'BLUE_MSG_SELF_FB_VERIFIED_TO_BSP_PREMISE_UNVERIFIED',
            118: 'E2E_IDENTITY_UNAVAILABLE',
            119: 'GROUP_CREATING',
            120: 'GROUP_CREATE_FAILED',
            121: 'GROUP_BOUNCED',
            122: 'BLOCK_CONTACT',
            123: 'EPHEMERAL_SETTING_NOT_APPLIED',
            124: 'SYNC_FAILED',
            125: 'SYNCING',
            126: 'BIZ_PRIVACY_MODE_INIT_FB',
            127: 'BIZ_PRIVACY_MODE_INIT_BSP',
            128: 'BIZ_PRIVACY_MODE_TO_FB',
            129: 'BIZ_PRIVACY_MODE_TO_BSP',
            130: 'DISAPPEARING_MODE',
            131: 'E2E_DEVICE_FETCH_FAILED',
            132: 'ADMIN_REVOKE',
            133: 'GROUP_INVITE_LINK_GROWTH_LOCKED',
            134: 'COMMUNITY_LINK_PARENT_GROUP',
            135: 'COMMUNITY_LINK_SIBLING_GROUP',
            136: 'COMMUNITY_LINK_SUB_GROUP',
            137: 'COMMUNITY_UNLINK_PARENT_GROUP',
            138: 'COMMUNITY_UNLINK_SIBLING_GROUP',
            139: 'COMMUNITY_UNLINK_SUB_GROUP',
            140: 'GROUP_PARTICIPANT_ACCEPT',
            141: 'GROUP_PARTICIPANT_LINKED_GROUP_JOIN',
            142: 'COMMUNITY_CREATE',
            143: 'EPHEMERAL_KEEP_IN_CHAT',
            144: 'GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST',
            145: 'GROUP_MEMBERSHIP_JOIN_APPROVAL_MODE',
            146: 'INTEGRITY_UNLINK_PARENT_GROUP',
            147: 'COMMUNITY_PARTICIPANT_PROMOTE',
            148: 'COMMUNITY_PARTICIPANT_DEMOTE',
            149: 'COMMUNITY_PARENT_GROUP_DELETED',
            150: 'COMMUNITY_LINK_PARENT_GROUP_MEMBERSHIP_APPROVAL',
            151: 'GROUP_PARTICIPANT_JOINED_GROUP_AND_PARENT_GROUP',
            152: 'MASKED_THREAD_CREATED',
            153: 'MASKED_THREAD_UNMASKED',
            154: 'BIZ_CHAT_ASSIGNMENT',
            155: 'CHAT_PSA',
            156: 'CHAT_POLL_CREATION_MESSAGE',
            157: 'CAG_MASKED_THREAD_CREATED',
            158: 'COMMUNITY_PARENT_GROUP_SUBJECT_CHANGED',
            159: 'CAG_INVITE_AUTO_ADD',
            160: 'BIZ_CHAT_ASSIGNMENT_UNASSIGN',
            161: 'CAG_INVITE_AUTO_JOINED',
            162: 'SCHEDULED_CALL_START_MESSAGE',
            163: 'COMMUNITY_INVITE_RICH',
            164: 'COMMUNITY_INVITE_AUTO_ADD_RICH',
            165: 'SUB_GROUP_INVITE_RICH',
            166: 'SUB_GROUP_PARTICIPANT_ADD_RICH',
            167: 'COMMUNITY_LINK_PARENT_GROUP_RICH',
            168: 'COMMUNITY_PARTICIPANT_ADD_RICH',
            169: 'SILENCED_UNKNOWN_CALLER_AUDIO',
            170: 'SILENCED_UNKNOWN_CALLER_VIDEO',
            171: 'GROUP_MEMBER_ADD_MODE',
            172: 'GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD',
            173: 'COMMUNITY_CHANGE_DESCRIPTION',
            174: 'SENDER_INVITE',
            175: 'RECEIVER_INVITE',
            176: 'COMMUNITY_ALLOW_MEMBER_ADDED_GROUPS',
            177: 'PINNED_MESSAGE_IN_CHAT',
            178: 'PAYMENT_INVITE_SETUP_INVITER',
            179: 'PAYMENT_INVITE_SETUP_INVITEE_RECEIVE_ONLY',
            180: 'PAYMENT_INVITE_SETUP_INVITEE_SEND_AND_RECEIVE',
            181: 'LINKED_GROUP_CALL_START',
            182: 'REPORT_TO_ADMIN_ENABLED_STATUS',
            183: 'EMPTY_SUBGROUP_CREATE',
            184: 'SCHEDULED_CALL_CANCEL',
            185: 'SUBGROUP_ADMIN_TRIGGERED_AUTO_ADD_RICH',
            186: 'GROUP_CHANGE_RECENT_HISTORY_SHARING',
            187: 'PAID_MESSAGE_SERVER_CAMPAIGN_ID',
            188: 'GENERAL_CHAT_CREATE',
            189: 'GENERAL_CHAT_ADD',
            190: 'GENERAL_CHAT_AUTO_ADD_DISABLED',
            191: 'SUGGESTED_SUBGROUP_ANNOUNCE',
            192: 'BIZ_BOT_1P_MESSAGING_ENABLED',
            193: 'CHANGE_USERNAME',
            194: 'BIZ_COEX_PRIVACY_INIT_SELF',
            195: 'BIZ_COEX_PRIVACY_TRANSITION_SELF',
            196: 'SUPPORT_AI_EDUCATION',
            197: 'BIZ_BOT_3P_MESSAGING_ENABLED',
            198: 'REMINDER_SETUP_MESSAGE',
            199: 'REMINDER_SENT_MESSAGE',
            200: 'REMINDER_CANCEL_MESSAGE',
            201: 'BIZ_COEX_PRIVACY_INIT',
            202: 'BIZ_COEX_PRIVACY_TRANSITION',
            203: 'GROUP_DEACTIVATED',
            204: 'COMMUNITY_DEACTIVATE_SIBLING_GROUP',
            205: 'EVENT_UPDATED',
            206: 'EVENT_CANCELED',
            207: 'COMMUNITY_OWNER_UPDATED',
            208: 'COMMUNITY_SUB_GROUP_VISIBILITY_HIDDEN',
            209: 'CAPI_GROUP_NE2EE_SYSTEM_MESSAGE',
            210: 'STATUS_MENTION',
            211: 'USER_CONTROLS_SYSTEM_MESSAGE',
            212: 'SUPPORT_SYSTEM_MESSAGE',
            213: 'CHANGE_LID',
            214: 'BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_IN_MESSAGE',
            215: 'BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_OUT_MESSAGE',
            216: 'CHANGE_LIMIT_SHARING',
            217: 'GROUP_MEMBER_LINK_MODE',
            218: 'BIZ_AUTOMATICALLY_LABELED_CHAT_SYSTEM_MESSAGE',
            219: 'PHONE_NUMBER_HIDING_CHAT_DEPRECATED_MESSAGE',
            220: 'QUARANTINED_MESSAGE',
            221: 'GROUP_MEMBER_SHARE_GROUP_HISTORY_MODE'
        };
        return stubTypes[msg.messageStubType] || `STUB_${msg.messageStubType}`;
    }

    const m = msg.message?.ephemeralMessage?.message || msg.message;
    if (!m) return 'UNKNOWN';

    const contextPin = m.messageContextInfo?.pinInChatMessage;

    if (m.protocolMessage) {
        const t = m.protocolMessage.type;
        if (t === 'MESSAGE_EDIT' || t === 14) return 'EDITED';
        if (t === 0 || t === 'REVOKE') return 'DELETED';
        return 'PROTOCOL';
    }

    const isNewsletter = msg.newsletter || msg.key?.remoteJid?.includes('newsletter');

    if (isNewsletter && m.questionMessage?.message) {
        const qMsg = m.questionMessage.message;

        // Mapa direto para questionMessage (newsletter)
        const newsletterMap = {
            imageMessage: 'NEWSLETTER_IMAGE',
            videoMessage: 'NEWSLETTER_VIDEO',
            audioMessage: 'NEWSLETTER_AUDIO',
            documentMessage: 'NEWSLETTER_DOCUMENT',
            stickerMessage: 'NEWSLETTER_STICKER',
            extendedTextMessage: 'NEWSLETTER_TEXT',
            conversation: 'NEWSLETTER_TEXT'
        };

        // Busca direta no mapa de newsletter
        for (const [key, value] of Object.entries(newsletterMap)) {
            if (qMsg[key]) return value;
        }
    }

    // Mapa direto de tipos normais
    const directMap = {
        conversation: 'TEXT',
        extendedTextMessage: 'EXTENDED',
        imageMessage: 'IMAGE',
        videoMessage: 'VIDEO',
        audioMessage: 'AUDIO',
        documentMessage: 'DOCUMENT',
        stickerMessage: m.stickerMessage?.isAnimated ? 'STICKER (ANIMATED)' : 'STICKER',
        locationMessage: 'LOCATION',
        contactMessage: 'CONTACT',
        contactsArrayMessage: 'CONTACTS',
        liveLocationMessage: 'LIVE-LOCATION',
        groupInviteMessage: 'GROUP-INVITE',
        pollCreationMessage: 'POLL',
        pollUpdateMessage: 'POLL-UPDATE',
        reactionMessage: 'REACTION',
        viewOnceMessage: 'VIEW-ONCE',
        buttonsMessage: 'BUTTONS',
        templateMessage: 'TEMPLATE',
        listMessage: 'LIST',
        interactiveMessage: 'INTERACTIVE',
        pinInChatMessage: 'PIN',
        messageContextInfo: 'CONTEXT',
        pollAdditionalUpdatesMessage: 'POLL-VOTE',
        editedMessage: 'EDIT',
        questionMessage: 'QUESTION',
         // Adicione mais tipos conforme necessário
    };

    // Sticker animado (Lottie)
    if (m.lottieStickerMessage?.message?.stickerMessage) return 'STICKER (ANIMATED)';

    // Busca direta no mapa
    for (const [key, value] of Object.entries(directMap)) {
        if (m[key]) return value;
    }

    // Pin
    if (contextPin) return 'PIN';

    // Metadados de sistema
    const metaKeys = Object.keys(m).filter(k => k.includes('Context') || k.includes('associated'));
    if (metaKeys.length > 0) return 'SYSTEM';
    return 'UNKNOWN';
}

/**
 * Busca TODAS as ocorrências de uma key
 * @param {Object} obj - Objeto para buscar
 * @param {string} targetKey - Key que você quer encontrar
 */
function findAllDeepKeys(obj, targetKey, maxDepth = 10) {

    /**
     * @type {any[]}
     */
    const results = [];

    /**
     * @param {Object} current
     * @param {number} depth
     */
    function search(current, depth) {
        if (!current || typeof current !== 'object' || depth <= 0) return;

        // @ts-ignore
        if (current[targetKey] !== undefined) {
            // @ts-ignore
            results.push(current[targetKey]);
        }

        for (const key of Object.keys(current)) {
            // @ts-ignore
            const value = current[key];
            if (value && typeof value === 'object') {
                search(value, depth - 1);
            }
        }
    }

    search(obj, maxDepth);
    return results;
}


/**
 * @param {any} jidOrLid
 * @param {{ ownerNumber: string | any[]; ownerLid: string | any[]; }} config
 */
function isBotOwner(jidOrLid, config) {
    return config.ownerNumber.includes(jidOrLid) || config.ownerLid.includes(jidOrLid);
}

module.exports = {
    getDetailedMessageType,
    findAllDeepKeys,
    isBotOwner
};
