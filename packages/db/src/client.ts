import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// globalThis cache : évite d'ouvrir un nouveau pool à chaque rechargement HMR de Next.js en dev.
const globalForDb = globalThis as unknown as { vivierQueryClient?: postgres.Sql };

const queryClient =
  globalForDb.vivierQueryClient ?? postgres(process.env.DATABASE_URL!, { max: 10 });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.vivierQueryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
