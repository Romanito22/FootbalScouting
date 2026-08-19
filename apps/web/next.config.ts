import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

// Le monorepo a un unique .env à la racine (cf. structure du projet) :
// Next.js ne le charge pas automatiquement puisque son cwd est apps/web.
config({ path: resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  transpilePackages: ['@vivier/db', '@vivier/metrics'],
};

export default nextConfig;
