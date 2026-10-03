import fs from 'node:fs';
const target='public/firebase-config.json';
if(process.env.PUBLIC_FIREBASE_CONFIG) {
  const config=JSON.parse(process.env.PUBLIC_FIREBASE_CONFIG);
  if(!config.apiKey || !config.projectId || !config.appId || !config.authDomain || config.projectId==='julius-workroom') throw Error('A separate DAILY ROOM Firebase configuration is required.');
  fs.writeFileSync(target,JSON.stringify(config,null,2));
} else if(!fs.existsSync(target)) fs.writeFileSync(target,'{}\n');
const config=JSON.parse(fs.readFileSync(target,'utf8'));
if(config.projectId==='julius-workroom') throw Error('WORK ROOM must not be used.');
