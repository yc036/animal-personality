import fs from 'node:fs';
const dest='supabase/functions/_shared';
fs.mkdirSync(dest,{recursive:true});
fs.copyFileSync('data/assessment.json',`${dest}/assessment.json`);
fs.writeFileSync(`${dest}/assessment.ts`,fs.readFileSync('lib/assessment.ts','utf8').replace('"../data/assessment.json"','"./assessment.json" with { type: "json" }'));
