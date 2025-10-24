const fs = require('fs').promises;
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

async function readConfig() {
  try {
    const txt = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(txt);
  } catch (err) {
    // Return default config if file missing or invalid
    return { web: { name: 'Pluma Panel' } };
  }
}

async function writeConfig(cfg) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

exports.showSettings = async (req, res) => {
  try {
    const cfg = await readConfig();
    res.render('admin/settings', { config: cfg });
  } catch (err) {
    console.error('read config error', err);
    res.status(500).send('Server error');
  }
};

exports.saveSettings = async (req, res) => {
  try {
    const body = req.body || {};
  const webName = (body['web.name'] || body.web_name || body.webName || '').trim();
  const webFavicon = (body['web.favicon'] || body.web_favicon || body.webFavicon || '').trim();

  const cfg = await readConfig();
  cfg.web = cfg.web || {};
  if (webName) cfg.web.name = webName;
  if (webFavicon) cfg.web.favicon = webFavicon;

    await writeConfig(cfg);
    res.redirect('/admin/settings');
  } catch (err) {
    console.error('write config error', err);
    res.status(500).send('Server error');
  }
};
