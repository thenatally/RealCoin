import Surreal, { RecordId } from 'surrealdb';
import type { z } from 'zod';
declare const surrealDb: Surreal;
export { surrealDb };
export declare class DBSingleton<T extends z.ZodTypeAny> {
    protected name: string;
    protected schema: T;
    protected defaultV: z.infer<T>;
    protected recordId: RecordId;
    private changeCallbacks;
    constructor(name: string, defaultV: z.infer<typeof schema>, schema: T);
    onChange(callback: (data: z.infer<T>) => void | Promise<void>): {
        trigger: (data: z.infer<T>) => Promise<void>;
        remove: () => void;
    };
    private notifyChange;
    get(): Promise<z.infer<T>>;
    set(data: z.infer<T>): Promise<void>;
    update(patch: Partial<z.infer<T>>): Promise<void>;
}
export declare class DBMap<T extends z.ZodTypeAny, D = z.infer<T> | null> {
    protected name: string;
    schema: T;
    defaultV: D;
    private changeCallbacks;
    constructor(name: string, schema: T, defaultV: D);
    onChange(callback: (key: string, data: z.infer<T> | null) => void | Promise<void>): {
        trigger: (key: string, data: z.infer<T> | null) => Promise<void>;
        remove: () => void;
    };
    private notifyChange;
    get(key: string): Promise<D extends null ? z.infer<T> | null : z.infer<T>>;
    set(key: string, data: z.infer<T>): Promise<void>;
    delete(key: string): Promise<void>;
    allKeys(): Promise<string[]>;
}
