/* Shared QA runtime. Prefer PLAYWRIGHT_MODULE, a local install, then the
   existing workstation cache. No package installation or app dependencies. */
const path = require('path'), fs = require('fs'), os = require('os');
let playwright;
const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'];
const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx');
if (fs.existsSync(cache)) for (const entry of fs.readdirSync(cache)) candidates.push(path.join(cache, entry, 'node_modules', 'playwright-core'));
for (const candidate of candidates.filter(Boolean)) {
  try { playwright = require(candidate); break; } catch (error) {
    if (candidate === process.env.PLAYWRIGHT_MODULE) throw new Error('PLAYWRIGHT_MODULE could not be loaded: ' + candidate, {cause:error});
  }
}
if (!playwright) throw new Error('Install Playwright locally or set PLAYWRIGHT_MODULE to its module directory.');
module.exports = {...playwright, base: process.env.QA_BASE_URL || `http://localhost:${process.env.QA_PORT || 8766}/`, widths: [1440,1024,768,390,320], routes: {studio:['overview','projects','requests','assets','scripts','analytics','settings'],admin:['dashboard','clients','requests','videos','revisions','assets','scripts','analytics','settings']}};
