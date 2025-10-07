import Surreal, { RecordId } from 'surrealdb';
import type { z } from 'zod';
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
		} catch (error: any) {
			
			console.log('Waiting for DB...');
			await new Promise((resolve) => setTimeout(resolve, 2500));
		}
	}
}

await connectDB();
export { surrealDb };
export class DBSingleton<T extends z.ZodTypeAny> {
	protected name: string;
	protected schema: T;
	protected defaultV: z.infer<T>;
	protected recordId: RecordId;
	private changeCallbacks: ((data: z.infer<T>) => void | Promise<void>)[] = [];

	constructor(name: string, defaultV: z.infer<typeof schema>, schema: T) {
		this.name = name;
		this.schema = schema;
		this.defaultV = defaultV;
		this.recordId = new RecordId('singleton', this.name);
	}

	onChange(callback: (data: z.infer<T>) => void | Promise<void>) {
		this.changeCallbacks.push(callback);
		return {
			trigger: async (data: z.infer<T>) => {
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

	private async notifyChange(data: z.infer<T>) {
		
		await Promise.allSettled(
			this.changeCallbacks.map(async (callback) => {
				try {
					await callback(data);
				} catch (error) {
					console.error('Error in onChange callback:', error);
				}
			})
		);
	}

	async get(): Promise<z.infer<T>> {
		const res = await surrealDb.select(this.recordId);
		if (!res) {
			return this.defaultV;
		}
		return this.schema.parse(res.value);
	}
	async set(data: z.infer<T>) {
		await this.schema.parseAsync(data);
		await surrealDb.upsert(this.recordId, {
			value: data
		});
		await writeDevJson(this.recordId, { value: data });
		await this.notifyChange(data);
	}
	async update(patch: Partial<z.infer<T>>) {
		await surrealDb.merge(this.recordId, {
			value: patch
		});
		await writeDevJson(this.recordId, { value: patch });
		
		const updatedData = await this.get();
		await this.notifyChange(updatedData);
	}
}

export class DBMap<T extends z.ZodTypeAny, D = z.infer<T> | null> {
	protected name: string;
	public schema: T;
	defaultV: D;
	private changeCallbacks: ((key: string, data: z.infer<T> | null) => void | Promise<void>)[] = [];

	constructor(name: string, schema: T, defaultV: D) {
		this.name = name;
		this.schema = schema;
		this.defaultV = defaultV;
	}

	onChange(callback: (key: string, data: z.infer<T> | null) => void | Promise<void>) {
		this.changeCallbacks.push(callback);
		return {
			trigger: async (key: string, data: z.infer<T> | null) => {
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

	private async notifyChange(key: string, data: z.infer<T> | null) {
		
		await Promise.allSettled(
			this.changeCallbacks.map(async (callback) => {
				try {
					await callback(key, data);
				} catch (error) {
					console.error('Error in onChange callback:', error);
				}
			})
		);
	}

	async get(key: string): Promise<D extends null ? z.infer<T> | null : z.infer<T>> {
		const res = await surrealDb.select(new RecordId(this.name, key));
		function notUndefined<T>(v: T) {
			return v !== undefined;
		}
		if (!notUndefined(res) || !notUndefined(res.value)) return this.defaultV as any;

		return this.schema.parse(res.value);
	}

	async set(key: string, data: z.infer<T>) {
		await this.schema.parseAsync(data);
		const recordId = new RecordId(this.name, key);
		await surrealDb.upsert(recordId, { value: data });
		await writeDevJson(recordId, { value: data });
		await this.notifyChange(key, data);
	}

	async delete(key: string) {
		const recordId = new RecordId(this.name, key);
		await surrealDb.delete(recordId);
		await deleteDevJson(recordId);
		await this.notifyChange(key, null);
	}

	async allKeys() {
		const sql = `SELECT id FROM ${this.name}`;
		const rows = await surrealDb.query(sql);
		return (rows[0] as { id: RecordId }[]).map(({ id }) => {
			return id.id.toString();
		});
	}
}

const DEV_DB_DIR = path.resolve(process.cwd(), 'dev_db');
async function writeDevJson(recordId: RecordId, data: any) {
	if (!isDev) return;
	await fs.mkdir(DEV_DB_DIR, { recursive: true });
	const file = path.join(DEV_DB_DIR, `${recordId.tb}_${recordId.id}.json`);
	await fs.writeFile(file, JSON.stringify(data, null, 2));
}
async function deleteDevJson(recordId: RecordId) {
	if (!isDev) return;
	const file = path.join(DEV_DB_DIR, `${recordId.tb}_${recordId.id}.json`);
	try {
		await fs.unlink(file);
	} catch {}
}
