import db, { setSetting, setReward } from '../lib/db';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'data', 'config.json');

async function migrate() {
  console.log('--- Starting Migration ---');
  if (!fs.existsSync(configPath)) {
    console.log('No config.json found, skipping migration.');
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Migrate generic settings
    if (data.tiktokUsername) {
      setSetting('tiktokUsername', data.tiktokUsername);
      console.log('Migrated tiktokUsername');
    }
    
    if (data.autoStartListener !== undefined) {
      setSetting('autoStartListener', data.autoStartListener);
      console.log('Migrated autoStartListener');
    }

    if (data.widgetConfig) {
      setSetting('widgetConfig', data.widgetConfig);
      console.log('Migrated widgetConfig');
    }

    // Migrate rewards
    if (data.rewards) {
      for (const [name, reward] of Object.entries(data.rewards)) {
        const r = reward as any;
        setReward(name, r.actions || []);
        console.log(`Migrated reward: ${name}`);
      }
    }

    console.log('--- Migration Completed Successfully ---');
    
    // Rename config.json to backup
    const backupPath = path.join(process.cwd(), 'data', 'config.json.bak');
    fs.renameSync(configPath, backupPath);
    console.log(`Backed up config.json to ${backupPath}`);

  } catch (err) {
    console.error('Migration failed:', err);
  }
}

migrate();
