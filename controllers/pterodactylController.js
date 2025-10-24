const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const http = require('http');
const https = require('https');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

async function readConfig() {
  try {
    const txt = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(txt || '{}');
  } catch (e) {
    return {};
  }
}

async function writeConfig(cfg) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

exports.show = async (req, res) => {
  try {
    const cfg = await readConfig();
    const ptero = cfg.pterodactyl || {};
    res.render('admin/pterodactyl', { pterodactyl: ptero });
  } catch (err) {
    console.error('ptero show error', err);
    res.status(500).send('Server error');
  }
};

exports.save = async (req, res) => {
  try {
    const body = req.body || {};
    const url = (body['pterodactyl.url'] || body.pterodactyl_url || '').trim();
    const apiKey = (body['pterodactyl.api_key'] || body.pterodactyl_api_key || body.pterodactylApiKey || '').trim();

    const cfg = await readConfig();
    cfg.pterodactyl = cfg.pterodactyl || {};
    if (url) cfg.pterodactyl.url = url;
    if (apiKey) cfg.pterodactyl.api_key = apiKey;
    await writeConfig(cfg);
    res.redirect('/admin/pterodactyl');
  } catch (err) {
    console.error('ptero save error', err);
    res.status(500).send('Server error');
  }
};

function requestOnce(urlObj, options = {}, cb) {
  const lib = urlObj.protocol === 'https:' ? https : http;
  const req = lib.request(urlObj, options, (res) => {
    let data = '';
    res.on('data', (d) => (data += d));
    res.on('end', () => cb(null, res, data));
  });
  req.on('error', (err) => cb(err));
  req.setTimeout = req.setTimeout || function(){};
  req.end();
}

exports.test = async (req, res) => {
  try {
    const body = req.body || {};
    const cfg = await readConfig();
    const base = (body.url || cfg.pterodactyl && cfg.pterodactyl.url || '').trim();
    const key = (body.apiKey || cfg.pterodactyl && cfg.pterodactyl.api_key || '').trim();

    if (!base) return res.json({ ok: false, error: 'Missing Pterodactyl URL' });
    if (!key) return res.json({ ok: false, error: 'Missing API key' });

    let endpoint;
    try {
      const u = new URL('/api/application/servers', base);
      endpoint = u;
    } catch (e) {
      return res.json({ ok: false, error: 'Invalid base URL' });
    }

    const lib = endpoint.protocol === 'https:' ? https : http;
    const opts = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      timeout: 8000,
    };

    const request = lib.request(endpoint, opts, (rsp) => {
      let data = '';
      rsp.on('data', (c) => (data += c));
      rsp.on('end', () => {
        const code = rsp.statusCode || 0;
        if (code >= 200 && code < 300) return res.json({ ok: true, status: code, message: 'Connection successful' });
        let parsed;
        try { parsed = JSON.parse(data || '{}'); } catch (e) { parsed = { raw: data }; }
        return res.json({ ok: false, status: code, error: parsed });
      });
    });

    request.on('error', (err) => res.json({ ok: false, error: String(err.message) }));
    request.setTimeout(8000, () => {
      request.destroy();
      return res.json({ ok: false, error: 'Request timed out' });
    });
    request.end();
  } catch (err) {
    console.error('ptero test error', err);
    res.json({ ok: false, error: 'Internal error' });
  }
};

// fetch nodes and server counts
exports.nodes = async (req, res) => {
  try {
    const body = req.body || {};
    const cfg = await readConfig();
    const base = (body.url || (cfg.pterodactyl && cfg.pterodactyl.url) || '').trim();
    const key = (body.apiKey || (cfg.pterodactyl && cfg.pterodactyl.api_key) || '').trim();

    if (!base) return res.json({ ok: false, error: 'Missing Pterodactyl URL' });
    if (!key) return res.json({ ok: false, error: 'Missing API key' });

    // helper to GET JSON from an endpoint
    const getJson = (endpoint) => new Promise((resolve, reject) => {
      try {
        const lib = endpoint.protocol === 'https:' ? https : http;
        const opts = { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, timeout: 8000 };
        const req = lib.request(endpoint, opts, (rsp) => {
          let data = '';
          rsp.on('data', (c) => data += c);
          rsp.on('end', () => {
            try { const j = JSON.parse(data || '{}'); resolve({ status: rsp.statusCode, body: j }); }
            catch (e) { resolve({ status: rsp.statusCode, body: data }); }
          });
        });
        req.on('error', (e) => reject(e));
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
      } catch (e) { reject(e); }
    });

    const nodesUrl = new URL('/api/application/nodes', base);
    const nodesResp = await getJson(nodesUrl);
    if (!nodesResp || nodesResp.status < 200 || nodesResp.status >= 300) {
      return res.json({ ok: false, error: 'Failed to fetch nodes', details: nodesResp });
    }

  // fetch servers to count and sum resource limits per node
  const serversUrl = new URL('/api/application/servers', base);
  serversUrl.searchParams.set('per_page', '1000');
  const serversResp = await getJson(serversUrl);
    if (!serversResp || serversResp.status < 200 || serversResp.status >= 300) {
      const nodes = (nodesResp.body && nodesResp.body.data) || nodesResp.body;
      const simple = Array.isArray(nodes) ? nodes.map(n => ({ id: n.attributes ? n.attributes.id : n.id, name: n.attributes ? n.attributes.name : n.name, fqdn: n.attributes ? n.attributes.fqdn : n.fqdn })) : [];
      return res.json({ ok: true, nodes: simple, totalNodes: simple.length, warning: 'Could not fetch servers to compute usage' });
    }

    const nodesList = (nodesResp.body && nodesResp.body.data) || nodesResp.body;
    const serversList = (serversResp.body && serversResp.body.data) || serversResp.body;

    // map node id to aggregated metrics (count, used memory, used disk)
    const metrics = {};
    if (Array.isArray(serversList)) {
      serversList.forEach(s => {
        // server node id can be in relationships or attributes
        const nodeId = (s.attributes && (s.attributes.node || s.attributes.node_id)) || s.node || s.node_id || (s.relationships && s.relationships.node && s.relationships.node.data && s.relationships.node.data.id);
        if (!nodeId) return;
        const limits = (s.attributes && s.attributes.limits) || (s.attributes && s.attributes.resources) || {};
        const mem = Number((limits.memory || limits.mem || 0));
        const disk = Number((limits.disk || limits.storage || 0));
        metrics[nodeId] = metrics[nodeId] || { server_count: 0, used_memory: 0, used_disk: 0 };
        metrics[nodeId].server_count += 1;
        metrics[nodeId].used_memory += Number.isFinite(mem) ? mem : 0;
        metrics[nodeId].used_disk += Number.isFinite(disk) ? disk : 0;
      });
    }

    // fetch locations to map location_id -> name
    let locationsMap = {};
    try {
      const locUrl = new URL('/api/application/locations', base);
      const locResp = await getJson(locUrl);
      const locList = (locResp && locResp.status >=200 && locResp.status<300) ? ((locResp.body && locResp.body.data) || locResp.body) : [];
      if (Array.isArray(locList)) {
        locList.forEach(l => {
          const a = l.attributes || l;
          const id = a.id || l.id;
          locationsMap[id] = a.short || a.long || a.name || a.description || (`loc-${id}`);
        });
      }
    } catch (e) {
      // ignore locations lookup failures
    }

    const nodesOut = Array.isArray(nodesList) ? nodesList.map(n => {
      const attr = n.attributes || n;
      const id = attr.id || n.id;
      const nodeTotalMem = Number(attr.memory || attr.total_memory || attr.memory_overall || 0);
      const nodeTotalDisk = Number(attr.disk || attr.total_disk || attr.storage || 0);
      const used = metrics[id] || { server_count: 0, used_memory: 0, used_disk: 0 };
      const locationId = attr.location_id || attr.location || (attr.location && attr.location.id) || null;
      return {
        id,
        name: attr.name || attr.fqdn || (`node-${id}`),
        fqdn: attr.fqdn || null,
        server_count: used.server_count || 0,
        total_memory: Number.isFinite(nodeTotalMem) ? nodeTotalMem : null,
        used_memory: used.used_memory || 0,
        total_disk: Number.isFinite(nodeTotalDisk) ? nodeTotalDisk : null,
        used_disk: used.used_disk || 0,
        location: locationId ? (locationsMap[locationId] || (`loc-${locationId}`)) : null,
      };
    }) : [];

    return res.json({ ok: true, nodes: nodesOut, totalNodes: nodesOut.length });
  } catch (err) {
    console.error('nodes fetch error', err);
    res.json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
