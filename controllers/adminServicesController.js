const PlansDB = require('../db/plans');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');

async function index(req, res) {
  try {
    const orders = await PlansDB.getAllOrders();
    res.render('admin/services', { orders });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load services');
  }
}

// suspend: set status to 'suspended'
async function suspend(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.redirect('/admin/services');
    const order = await PlansDB.getOrderById(id);
    if (!order) return res.redirect('/admin/services');

    // load pterodactyl config
    try {
      const cfgPath = path.join(__dirname, '..', 'config', 'config.json');
      const txt = await fs.readFile(cfgPath, 'utf8');
      const cfg = JSON.parse(txt || '{}');
      const ptero = cfg.pterodactyl || {};
      const base = (ptero.url || '').trim();
      const key = (ptero.api_key || '').trim();

      // if there's a ptero_server_id and API configured, call suspend/unsuspend appropriately
      const serverId = order.ptero_server_id || null;
      if (base && key && serverId) {
        const doRequest = (urlObj, options = {}, body = null) => new Promise((resolve, reject) => {
          const lib = urlObj.protocol === 'https:' ? https : http;
          const req = lib.request(urlObj, options, (rsp) => {
            let d = '';
            rsp.on('data', (c) => d += c);
            rsp.on('end', () => resolve({ status: rsp.statusCode, body: d }));
          });
          req.on('error', (e) => reject(e));
          if (body) req.write(body);
          req.end();
        });

        // toggle: if currently suspended->unsuspend, else suspend
        if (String(order.status).toLowerCase() === 'suspended') {
          // unsuspend
          const url = new URL(`/api/application/servers/${serverId}/unsuspend`, base);
          try {
            const resp = await doRequest(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            let parsed = null; try { parsed = JSON.parse(resp.body || '{}'); } catch (e) { parsed = { raw: resp.body }; }
            await PlansDB.markOrderProvisionResult(id, serverId, parsed, 'active');
          } catch (e) {
            console.error('Failed to unsuspend server on Pterodactyl', e);
            // still update DB to mark error
            try { await PlansDB.markOrderProvisionResult(id, serverId, { error: String(e && e.message ? e.message : e) }, 'error'); } catch (ee) { /* ignore */ }
          }
        } else {
          // suspend
          const url = new URL(`/api/application/servers/${serverId}/suspend`, base);
          try {
            const resp = await doRequest(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            let parsed = null; try { parsed = JSON.parse(resp.body || '{}'); } catch (e) { parsed = { raw: resp.body }; }
            await PlansDB.markOrderProvisionResult(id, serverId, parsed, 'suspended');
          } catch (e) {
            console.error('Failed to suspend server on Pterodactyl', e);
            try { await PlansDB.markOrderProvisionResult(id, serverId, { error: String(e && e.message ? e.message : e) }, 'error'); } catch (ee) { /* ignore */ }
          }
        }
      } else {
        // no ptero config or server id -> just update DB status toggle
        const newStatus = (String(order.status).toLowerCase() === 'suspended') ? 'active' : 'suspended';
        await PlansDB.updateOrderStatus(id, newStatus);
      }
    } catch (e) {
      console.error('Error while attempting to toggle suspend status', e);
      // fallback: mark suspended in DB
      await PlansDB.updateOrderStatus(id, 'suspended');
    }

    return res.redirect('/admin/services');
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to suspend service');
  }
}

// unsuspend: explicit unsuspend endpoint (delegates to suspend which toggles)
async function unsuspend(req, res) {
  try {
    // simply call suspend handler which will toggle based on current status
    return await suspend(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to unsuspend service');
  }
}

// delete: remove order (and optionally call Pterodactyl delete later)
async function remove(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.redirect('/admin/services');
    const order = await PlansDB.getOrderById(id);
    if (!order) return res.redirect('/admin/services');

    // load pterodactyl config and attempt to delete server from panel if present
    try {
      const cfgPath = path.join(__dirname, '..', 'config', 'config.json');
      const txt = await fs.readFile(cfgPath, 'utf8');
      const cfg = JSON.parse(txt || '{}');
      const ptero = cfg.pterodactyl || {};
      const base = (ptero.url || '').trim();
      const key = (ptero.api_key || '').trim();

      const serverUuid = order.ptero_server_uuid || null;
      let serverIdForApi = order.ptero_server_id || null;
      // If we don't have numeric server id, try to lookup by uuid/identifier
      if (!serverIdForApi && serverUuid) {
        try {
          // attempt to fetch server list and match by identifier
          // we'll do this below using doRequest for consistency
        } catch (e) {
          // ignore, we'll try another approach below
        }
      }
      if (base && key && (serverIdForApi || serverUuid)) {
        const doRequest = (urlObj, options = {}, body = null) => new Promise((resolve, reject) => {
          const lib = urlObj.protocol === 'https:' ? https : http;
          const req = lib.request(urlObj, options, (rsp) => {
            let d = '';
            rsp.on('data', (c) => d += c);
            rsp.on('end', () => resolve({ status: rsp.statusCode, body: d }));
          });
          req.on('error', (e) => reject(e));
          if (body) req.write(body);
          req.end();
        });

        // if no numeric id yet, try fetching server list and find numeric id by uuid/identifier
        if (!serverIdForApi && serverUuid) {
          try {
            const listUrl = new URL('/api/application/servers', base);
            listUrl.searchParams.set('per_page', '1000');
            const listResp = await doRequest(listUrl, { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            let lp = {};
            try { lp = JSON.parse(listResp.body || '{}'); } catch (e) { lp = { raw: listResp.body }; }
            const listData = (lp && lp.data) || [];
            for (const s of listData) {
              const attrs = (s && s.attributes) || s;
              const identifier = attrs && (attrs.identifier || attrs.uuid || attrs.id || attrs.identifier);
              if (identifier && String(identifier) === String(serverUuid)) {
                serverIdForApi = (s && s.id) || (attrs && attrs.id) || serverIdForApi;
                break;
              }
            }
          } catch (e) {
            console.error('Failed to lookup server id by uuid', e);
          }
        }

        try {
          // if we now have a numeric id, call DELETE on that id
          if (serverIdForApi) {
            const url = new URL(`/api/application/servers/${serverIdForApi}`, base);
            const resp = await doRequest(url, { method: 'DELETE', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            let parsed = null; try { parsed = JSON.parse(resp.body || '{}'); } catch (e) { parsed = { raw: resp.body }; }
            if (resp.status >= 200 && resp.status < 300) {
              // server deleted on panel; now delete DB record
              await PlansDB.deleteOrder(id);
              return res.redirect('/admin/services');
            } else {
              console.error('Failed to delete server on Pterodactyl', resp.status, parsed);
              try { await PlansDB.markOrderProvisionResult(id, order.ptero_server_id || null, parsed, 'error'); } catch (ee) { console.error('Failed to mark deletion error', ee); }
              return res.redirect('/admin/services');
            }
          } else {
            // couldn't resolve numeric id: log and fallback to deleting DB record
            console.error('Could not determine numeric Pterodactyl server id to delete for order', id, 'uuid:', serverUuid);
            await PlansDB.deleteOrder(id);
            return res.redirect('/admin/services');
          }
        } catch (e) {
          console.error('Error calling Pterodactyl delete', e);
          try { await PlansDB.markOrderProvisionResult(id, order.ptero_server_id || null, { error: String(e && e.message ? e.message : e) }, 'error'); } catch (ee) { /* ignore */ }
          return res.redirect('/admin/services');
        }
      } else {
        // no pterodactyl configured or no server id/uuid — just delete DB record
        await PlansDB.deleteOrder(id);
        return res.redirect('/admin/services');
      }
    } catch (e) {
      console.error('Failed to load pterodactyl config for delete', e);
      // fallback: delete DB record
      try { await PlansDB.deleteOrder(id); } catch (ee) { console.error('Failed to delete order from DB', ee); }
      return res.redirect('/admin/services');
    }
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to delete service');
  }
}

module.exports = {
  index,
  suspend,
  unsuspend,
  remove,
};
