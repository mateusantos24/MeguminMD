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

function createCompatStatement(stmt) {
    return {
        get: (...args) => stmt.get(...normalizeSqlArgs(args)),
        all: (...args) => stmt.all(...normalizeSqlArgs(args)),
        run: (...args) => stmt.run(...normalizeSqlArgs(args)),
        pluck: () => createCompatStatement(stmt),
        raw: () => createCompatStatement(stmt)
    };
}

const fs = require("fs");
const path = require("path");

class Database {
    constructor(filename, options = {}) {
        this._driver = null;
        this._db = null;
        this._transactionDepth = 0;

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

        const preferredDriver = String(process.env.SQLITE_PREFERRED_DRIVER || "")
            .trim()
            .toLowerCase();
        const attempts = preferredDriver === "node" || preferredDriver === "node:sqlite"
            ? [this._openNodeBuiltinSqlite.bind(this), this._openBetterSqlite3.bind(this)]
            : [this._openBetterSqlite3.bind(this), this._openNodeBuiltinSqlite.bind(this)];
        const errors = [];

        for (const attempt of attempts) {
            try {
                const result = attempt(filename, options);
                if (!result?.db) continue;
                this._driver = result.driver;
                this._db = result.db;
                return;
            } catch (error) {
                errors.push(error);
            }
        }

        const err = new Error(
            "SQLite indisponivel neste runtime. Use Node 22+ com node:sqlite, instale 'better-sqlite3' ou execute com Bun."
        );
        if (errors.length > 0) {
            err.cause = errors[errors.length - 1];
            err.attemptErrors = errors;
        }
        throw err;
    }

    _openBetterSqlite3(filename, options) {
        let BetterSqlite3;
        try {
            BetterSqlite3 = require("better-sqlite3");
        } catch (cause) {
            const err = new Error("Nao foi possivel carregar 'better-sqlite3'.");
            err.cause = cause;
            throw err;
        }

        return {
            driver: "better-sqlite3",
            db: new BetterSqlite3(filename, options)
        };
    }

    _openNodeBuiltinSqlite(filename) {
        let DatabaseSync;
        try {
            ({ DatabaseSync } = require("node:sqlite"));
        } catch (cause) {
            const err = new Error("Nao foi possivel carregar o modulo interno 'node:sqlite'.");
            err.cause = cause;
            throw err;
        }

        return {
            driver: "node:sqlite",
            db: new DatabaseSync(filename)
        };
    }

    exec(sql) {
        return this._db.exec(sql);
    }

    prepare(sql) {
        if (this._driver === "bun") {
            return createCompatStatement(this._db.query(sql));
        }

        if (this._driver === "node:sqlite") {
            return createCompatStatement(this._db.prepare(sql));
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

        if (this._driver === "node:sqlite") {
            return (...args) => {
                const transactionId = ++this._transactionDepth;
                const savepointName = `codex_tx_${transactionId}`;
                const beginSql = transactionId === 1 ? "BEGIN" : `SAVEPOINT ${savepointName}`;
                const commitSql = transactionId === 1 ? "COMMIT" : `RELEASE SAVEPOINT ${savepointName}`;
                const rollbackSql = transactionId === 1 ? "ROLLBACK" : `ROLLBACK TO SAVEPOINT ${savepointName}`;

                this._db.exec(beginSql);
                try {
                    const result = fn(...args);
                    this._db.exec(commitSql);
                    return result;
                } catch (error) {
                    try {
                        this._db.exec(rollbackSql);
                        if (transactionId !== 1) {
                            this._db.exec(`RELEASE SAVEPOINT ${savepointName}`);
                        }
                    } catch { }
                    throw error;
                } finally {
                    this._transactionDepth = Math.max(0, this._transactionDepth - 1);
                }
            };
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
