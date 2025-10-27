const express = require('express');
const router = express.Router();
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const https = require('https');
const pkg = require('../package.json');

// helper to fetch JSON from a URL using https with a User-Agent (GitHub requires UA)
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Pluma-Panel-Updater' } }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d || '{}')); } catch (e) { return reject(e); }
      });
    });
    req.on('error', reject);
  });
}

router.get('/', ensureAuth, ensureAdmin, async (req, res) => {
  let updateAvailable = false;
  let latestRelease = null;
  try {
    const apiUrl = 'https://api.github.com/repos/PlumaOffical/Pluma-Panel/releases/latest';
    const rel = await fetchJson(apiUrl);
    latestRelease = rel || null;
    const latestTag = (rel && (rel.tag_name || rel.name)) ? String((rel.tag_name || rel.name)).replace(/^v/i, '') : null;
    const current = (pkg && pkg.version) ? String(pkg.version).replace(/^v/i, '') : null;
    if (latestTag && current && latestTag !== current) updateAvailable = true;
  } catch (e) {
    // don't block admin page if GitHub check fails
    console.error('Failed to check GitHub latest release', e && e.message ? e.message : e);
  }

  // render admin page with update info
  res.render('admin/admin', { updateAvailable, latestRelease, currentVersion: pkg.version });
});

module.exports = router;
