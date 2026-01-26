import { eq, sql } from "drizzle-orm";
import type { PgTable, TableConfig } from "drizzle-orm/pg-core";
import type { Database } from "../client.js";

export interface ListOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export abstract class BaseRepository<
  TTable extends PgTable<TableConfig>,
  TSelect,
  TInsert,
> {
  constructor(
    protected db: Database,
    protected table: TTable,
    protected idColumn: keyof TTable["_"]["columns"]
  ) {}

  async findById(id: string): Promise<TSelect | null> {
    const idCol = (this.table as Record<string, unknown>)[this.idColumn as string];
    const results = await this.db
      .select()
      .from(this.table)
      .where(eq(idCol as ReturnType<typeof sql>, id))
      .limit(1);
    return (results[0] as TSelect) ?? null;
  }

  async findMany(options: ListOptions = {}): Promise<PaginatedResult<TSelect>> {
    const { limit = 20, offset = 0 } = options;

    // Get total count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(this.table);
    const total = Number(countResult[0]?.count ?? 0);

    // Get data
    const data = await this.db
      .select()
      .from(this.table)
      .limit(limit)
      .offset(offset);

    return {
      data: data as TSelect[],
      total,
      limit,
      offset,
    };
  }

  async create(data: TInsert): Promise<TSelect> {
    const results = await this.db
      .insert(this.table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(data as any)
      .returning();
    return results[0] as TSelect;
  }

  async update(id: string, data: Partial<TInsert>): Promise<TSelect | null> {
    const idCol = (this.table as Record<string, unknown>)[this.idColumn as string];
    const results = await this.db
      .update(this.table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(data as any)
      .where(eq(idCol as ReturnType<typeof sql>, id))
      .returning();
    return (results[0] as TSelect) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const idCol = (this.table as Record<string, unknown>)[this.idColumn as string];
    const results = await this.db
      .delete(this.table)
      .where(eq(idCol as ReturnType<typeof sql>, id))
      .returning();
    return results.length > 0;
  }
}
