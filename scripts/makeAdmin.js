#!/usr/bin/env node
const readline = require('readline');
const db = require('../db/init');

async function makeAdminPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q) => new Promise((res) => rl.question(q, res));

  try {
    const idArg = process.argv[2];
    let id = idArg;
    if (!id) id = await question('Enter user id to make admin: ');
    id = Number(id);
    if (!Number.isInteger(id)) {
      console.error('Invalid id');
      process.exit(1);
    }

    const changed = await db.setAdmin(id, 1);
    if (changed && changed > 0) {
      console.log(`User id=${id} is now admin.`);
    } else {
      console.log(`No user updated. Make sure user id=${id} exists.`);
    }
  } catch (err) {
    console.error('Error setting admin:', err);
  } finally {
    rl.close();
    db.close().catch(() => {});
    process.exit(0);
  }
}

makeAdminPrompt();
