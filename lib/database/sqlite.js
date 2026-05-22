function isBunRuntime() {
    return !!(globalThis && globalThis.Bun) || !!process.versions?.bun;
}

function normalizeSqlValue(value) {
    if (value === undefined || value === null) return null;
    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean" || type === "bigint") return value;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) return value;
    if (type === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function normalizeSqlArgs(args) {
    if (!args || args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0].map(normalizeSqlValue);
    return Array.from(args).map(normalizeSqlValue);
}

const fs = require("fs");
const path = require("path");

class Database {
    constructor(filename, options = {}) {
        this._driver = null;
        this._db = null;

        if (typeof filename === "string" && filename && filename !== ":memory:" && !filename.startsWith("file:")) {
            const dir = path.dirname(filename);
            if (dir && dir !== "." && dir !== filename) {
                try {
                    fs.mkdirSync(dir, { recursive: true });
                } catch { }
            }
        }

        if (isBunRuntime()) {
            const { Database: BunDatabase } = require("bun:sqlite");
            this._driver = "bun";
            this._db = new BunDatabase(filename, options);
            return;
        }

        let BetterSqlite3;
        try {
            BetterSqlite3 = require("better-sqlite3");
        } catch (cause) {
            const err = new Error(
                "SQLite indisponível no Node. Instale 'better-sqlite3' (npm i better-sqlite3) ou execute com Bun."
            );
            err.cause = cause;
            throw err;
        }

        this._driver = "better-sqlite3";
        this._db = new BetterSqlite3(filename, options);
    }

    exec(sql) {
        return this._db.exec(sql);
    }

    prepare(sql) {
        if (this._driver === "bun") {
            const stmt = this._db.query(sql);
            return {
                get: (...args) => stmt.get(...args),
                all: (...args) => stmt.all(...args),
                run: (...args) => stmt.run(...args),
                pluck: () => this.prepare(sql),
                raw: () => this.prepare(sql)
            };
        }

        return this._db.prepare(sql);
    }

    query(sql) {
        return this.prepare(sql);
    }

    run(sql, ...args) {
        const stmt = this.prepare(sql);
        const safeArgs = normalizeSqlArgs(args);
        return stmt.run(...safeArgs);
    }

    get(sql, ...args) {
        const stmt = this.prepare(sql);
        const safeArgs = normalizeSqlArgs(args);
        return stmt.get(...safeArgs);
    }

    all(sql, ...args) {
        const stmt = this.prepare(sql);
        const safeArgs = normalizeSqlArgs(args);
        return stmt.all(...safeArgs);
    }

    transaction(fn) {
        if (typeof this._db.transaction === "function") {
            return this._db.transaction(fn);
        }
        return (...args) => fn(...args);
    }

    close() {
        return this._db.close?.();
    }
}

module.exports = {
    Database,
    isBunRuntime
};
