const { loadEnvConfig } = require('@next/env');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.error('DATABASE_URL and DIRECT_URL must be set in the local environment.');
  process.exit(1);
}

const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
const migrationName = '20261010000000_adb_agent_queue';
const migrationFile = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  migrationName,
  'migration.sql',
);
const env = { ...process.env, DATABASE_URL: process.env.DIRECT_URL };

function runPrisma(args, options = {}) {
  return spawnSync(process.execPath, [prismaCli, ...args], {
    env,
    encoding: 'utf8',
    ...options,
  });
}

const schemaFile = path.join(process.cwd(), 'prisma', 'schema.prisma');
const status = runPrisma(['migrate', 'status', '--schema', schemaFile]);
if (status.error) throw status.error;

if (status.stdout) process.stdout.write(status.stdout);
if (status.stderr) process.stderr.write(status.stderr);

if (status.status === 0) {
  const deploy = runPrisma(['migrate', 'deploy', '--schema', schemaFile], { stdio: 'inherit' });
  if (deploy.error) throw deploy.error;
  process.exit(deploy.status ?? 1);
}

const statusOutput = `${status.stdout || ''}\n${status.stderr || ''}`;
if (!statusOutput.includes('P3005')) process.exit(status.status ?? 1);

console.log('Existing database detected; applying the initial ADB migration with Prisma and baselining it.');
const execute = runPrisma([
  'db',
  'execute',
  '--schema',
  schemaFile,
  '--file',
  migrationFile,
], { stdio: 'inherit' });
if (execute.error) throw execute.error;
if (execute.status !== 0) process.exit(execute.status ?? 1);

const resolve = runPrisma([
  'migrate',
  'resolve',
  '--schema',
  schemaFile,
  '--applied',
  migrationName,
], { stdio: 'inherit' });
if (resolve.error) throw resolve.error;
if (resolve.status !== 0) process.exit(resolve.status ?? 1);

console.log(`Applied and recorded Prisma migration ${migrationName}.`);
