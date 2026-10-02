const { DatabaseSync, backup } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.DATA_DIR || path.join(__dirname, '../data');
const targetDir = process.env.BACKUP_DIR || path.join(dir, 'backups');
fs.mkdirSync(targetDir, { recursive: true });
const target = path.join(targetDir, `restaurant-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const db = new DatabaseSync(path.join(dir, 'restaurant.sqlite'), { readOnly: true });
backup(db, target).then(() => {
  db.close();
  const check = new DatabaseSync(target, { readOnly: true });
  const result = check.prepare('PRAGMA integrity_check').get(); check.close();
  if (result.integrity_check !== 'ok') throw new Error('Backup integrity check failed');
  console.log(`Verified backup: ${target}`);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
