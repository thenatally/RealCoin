import Surreal, { RecordId } from 'surrealdb';
import fs from 'fs/promises';
import path from 'path';
const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL;
const surrealDb = new Surreal();
async function connectDB() {
    console.log('Connecting to DB at ', process.env.SURREAL_URI);
    while (true) {
        try {
            await surrealDb.connect(process.env.SURREAL_URI ?? 'ws://localhost:9000/rpc', {
                namespace: 'realcoin',
                database: isDev ? 'dev' : 'prod',
                auth: { username: 'root', password: 'root' }
            });
            console.log('Connected to DB');
            break;
        }
        catch (error) {
            console.log('Waiting for DB...');
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }
    }
}
await connectDB();
export { surrealDb };
export class DBSingleton {
    name;
    schema;
    defaultV;
    recordId;
    changeCallbacks = [];
    constructor(name, defaultV, schema) {
        this.name = name;
        this.schema = schema;
        this.defaultV = defaultV;
        this.recordId = new RecordId('singleton', this.name);
    }
    onChange(callback) {
        this.changeCallbacks.push(callback);
        return {
            trigger: async (data) => {
                await this.notifyChange(data);
            },
            remove: () => {
                const index = this.changeCallbacks.indexOf(callback);
                if (index > -1) {
                    this.changeCallbacks.splice(index, 1);
                }
            }
        };
    }
    async notifyChange(data) {
        await Promise.allSettled(this.changeCallbacks.map(async (callback) => {
            try {
                await callback(data);
            }
            catch (error) {
                console.error('Error in onChange callback:', error);
            }
        }));
    }
    async get() {
        const res = await surrealDb.select(this.recordId);
        if (!res) {
            return this.defaultV;
        }
        return this.schema.parse(res.value);
    }
    async set(data) {
        await this.schema.parseAsync(data);
        await surrealDb.upsert(this.recordId, {
            value: data
        });
        await writeDevJson(this.recordId, { value: data });
        await this.notifyChange(data);
    }
    async update(patch) {
        await surrealDb.merge(this.recordId, {
            value: patch
        });
        await writeDevJson(this.recordId, { value: patch });
        const updatedData = await this.get();
        await this.notifyChange(updatedData);
    }
}
export class DBMap {
    name;
    schema;
    defaultV;
    changeCallbacks = [];
    constructor(name, schema, defaultV) {
        this.name = name;
        this.schema = schema;
        this.defaultV = defaultV;
    }
    onChange(callback) {
        this.changeCallbacks.push(callback);
        return {
            trigger: async (key, data) => {
                await this.notifyChange(key, data);
            },
            remove: () => {
                const index = this.changeCallbacks.indexOf(callback);
                if (index > -1) {
                    this.changeCallbacks.splice(index, 1);
                }
            }
        };
    }
    async notifyChange(key, data) {
        await Promise.allSettled(this.changeCallbacks.map(async (callback) => {
            try {
                await callback(key, data);
            }
            catch (error) {
                console.error('Error in onChange callback:', error);
            }
        }));
    }
    async get(key) {
        const res = await surrealDb.select(new RecordId(this.name, key));
        function notUndefined(v) {
            return v !== undefined;
        }
        if (!notUndefined(res) || !notUndefined(res.value))
            return this.defaultV;
        return this.schema.parse(res.value);
    }
    async set(key, data) {
        await this.schema.parseAsync(data);
        const recordId = new RecordId(this.name, key);
        await surrealDb.upsert(recordId, { value: data });
        await writeDevJson(recordId, { value: data });
        await this.notifyChange(key, data);
    }
    async delete(key) {
        const recordId = new RecordId(this.name, key);
        await surrealDb.delete(recordId);
        await deleteDevJson(recordId);
        await this.notifyChange(key, null);
    }
    async allKeys() {
        const sql = `SELECT id FROM ${this.name}`;
        const rows = await surrealDb.query(sql);
        return rows[0].map(({ id }) => {
            return id.id.toString();
        });
    }
}
const DEV_DB_DIR = path.resolve(process.cwd(), 'dev_db');
async function writeDevJson(recordId, data) {
    if (!isDev)
        return;
    await fs.mkdir(DEV_DB_DIR, { recursive: true });
    const file = path.join(DEV_DB_DIR, `${recordId.tb}_${recordId.id}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
}
async function deleteDevJson(recordId) {
    if (!isDev)
        return;
    const file = path.join(DEV_DB_DIR, `${recordId.tb}_${recordId.id}.json`);
    try {
        await fs.unlink(file);
    }
    catch { }
}
//# sourceMappingURL=db.js.map