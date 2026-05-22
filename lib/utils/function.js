const config = require('../../config/config');

// Funções utilitárias
class Utils {
    static isOwner(userId) {
        return userId === config.ownerNumber;
    }

    static formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

module.exports = Utils;
