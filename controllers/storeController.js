const PlansDB = require('../db/plans');
const Users = require('../db/init');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');

async function showStore(req, res) {
  try {
    const plans = await PlansDB.getPlans();
    res.render('store/store', { plans });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load store');
  }
}

async function showCheckout(req, res) {
  try {
    const planId = parseInt(req.params.id);
    if (!planId) return res.redirect('/store');
    const plan = await PlansDB.getPlanById(planId);
    if (!plan) return res.redirect('/store');
    res.render('store/checkout', { plan, success: false, order: null });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load checkout');
  }
}

async function postCheckout(req, res) {
    try {
      if (!req.session || !req.session.user) return res.redirect('/auth/login');
      const userId = req.session.user.id;
      const planId = parseInt(req.params.id);
      const server_name = String(req.body.server_name || '').trim();
      if (!planId || !server_name) return res.status(400).send('Missing server name or plan');
      const plan = await PlansDB.getPlanById(planId);
      if (!plan) return res.status(400).send('Plan not found');

      // compute expiry based on plan billing_cycle and create order
      // use fixed-day arithmetic: 30 days for monthly, 365 days for yearly
      let expiresAt = null;
      try {
        const now = new Date();
        const bc = (plan && plan.billing_cycle) ? String(plan.billing_cycle).toLowerCase() : 'monthly';
        const msPerDay = 24 * 60 * 60 * 1000;
        const days = bc.includes('year') ? 365 : 30;
        const exp = new Date(now.getTime() + (days * msPerDay));
        expiresAt = exp.toISOString();
      } catch (e) { expiresAt = null; }

      // create order and mark processing
      const orderId = await PlansDB.createOrder(userId, planId, server_name, plan.price, expiresAt);
      try { await PlansDB.updateOrderStatus(orderId, 'processing'); } catch (e) { console.error('Failed to set order processing status', e); }

      // load config
      const cfgPath = path.join(__dirname, '..', 'config', 'config.json');
      const txt = await fs.readFile(cfgPath, 'utf8');
      const cfg = JSON.parse(txt || '{}');
      const ptero = cfg.pterodactyl || {};
      const base = (ptero.url || '').trim();
      const key = (ptero.api_key || '').trim();

      // helper to perform http(s) requests
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

      let generatedPteroPassword = null;
      let panelUserAfter = null;

      if (base && key) {
        // ensure we have panel user mapping
        const panelUser = await Users.findById(userId);
        let pteroUserId = panelUser && panelUser.ptero_user_id ? panelUser.ptero_user_id : null;
        if (!pteroUserId) {
          // try to create ptero user
          generatedPteroPassword = Array.from({length:12}).map(()=>'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-='[Math.floor(Math.random()*76)]).join('');
          const userPayload = {
            email: panelUser && panelUser.email ? panelUser.email : (req.session.user && req.session.user.email) || (`user${userId}@example.com`),
            username: panelUser && panelUser.username ? panelUser.username : (`user${userId}`),
            first_name: panelUser && panelUser.username ? panelUser.username : 'User',
            last_name: panelUser && panelUser.username ? panelUser.username : 'User',
            password: generatedPteroPassword
          };

          try {
            const usersUrl = new URL('/api/application/users', base);
            const resp = await doRequest(usersUrl, { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' } }, JSON.stringify(userPayload));
            let parsed = {};
            try { parsed = JSON.parse(resp.body || '{}'); } catch (e) { parsed = { raw: resp.body }; }
            if (resp.status >= 200 && resp.status < 300) {
              pteroUserId = (parsed && parsed.data && parsed.data.id) || (parsed && parsed.attributes && parsed.attributes.id) || parsed && parsed.id || null;
              try { await Users.setPteroInfo(userId, pteroUserId, generatedPteroPassword); } catch (e) { console.error('Failed to save ptero user mapping', e); }
            } else {
              // fallback: list users and try to match by email
              try {
                const findUrl = new URL('/api/application/users', base);
                const listResp = await doRequest(findUrl, { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
                let listParsed = {};
                try { listParsed = JSON.parse(listResp.body || '{}'); } catch (e) { listParsed = { raw: listResp.body }; }
                const dataList = (listParsed && listParsed.data) || [];
                const wanted = (userPayload.email || '').toLowerCase();
                if (Array.isArray(dataList)) {
                  for (const u of dataList) {
                    const attr = u && u.attributes ? u.attributes : u;
                    const ue = (attr && attr.email) || (attr && attr.user && attr.user.email) || null;
                    if (ue && String(ue).toLowerCase() === wanted) {
                      pteroUserId = u && u.id ? u.id : (attr && attr.id) || null;
                      try { await Users.setPteroInfo(userId, pteroUserId, null); } catch (e) { console.error('Failed to save ptero mapping after lookup', e); }
                      break;
                    }
                  }
                }
              } catch (e) {
                console.error('Failed fallback user lookup', e);
              }
            }
          } catch (e) {
            console.error('Failed to create or lookup Pterodactyl user', e);
          }
        }

  // fetch egg metadata if available
  let dockerImage = null;
  let startup = null;
  let feature_limits = null;
  let eggAttr = null;
  try {
          if (plan.nest && plan.egg) {
            const eggUrl = new URL(`/api/application/nests/${plan.nest}/eggs/${plan.egg}`, base);
            const eggResp = await doRequest(eggUrl, { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            let ep = {};
            try { ep = JSON.parse(eggResp.body || '{}'); } catch (e) { ep = { raw: eggResp.body }; }
            const attr = (ep && ep.data && ep.data.attributes) || ep.attributes || {};
            eggAttr = attr;

            // helper: recursively search object for a likely docker image string
            const findDockerImage = (obj, seen = new Set()) => {
              if (!obj || typeof obj === 'number' || typeof obj === 'boolean') return null;
              if (typeof obj === 'string') {
                const s = obj.trim();
                // heuristic: typical docker image contains a '/' and no whitespace
                if (s.includes('/') && !/\s/.test(s)) return s;
                return null;
              }
              if (Array.isArray(obj)) {
                for (const v of obj) {
                  const f = findDockerImage(v, seen);
                  if (f) return f;
                }
                return null;
              }
              try {
                if (seen.has(obj)) return null;
                seen.add(obj);
              } catch (e) { /* ignore non-hashable */ }
              for (const k of Object.keys(obj || {})) {
                const v = obj[k];
                // common container keys
                if (k && typeof k === 'string' && (k.toLowerCase().includes('container') || k.toLowerCase().includes('image') || k.toLowerCase().includes('docker'))) {
                  const f = findDockerImage(v, seen);
                  if (f) return f;
                }
              }
              for (const k of Object.keys(obj || {})) {
                const v = obj[k];
                const f = findDockerImage(v, seen);
                if (f) return f;
              }
              return null;
            };

            dockerImage = (attr && attr.container && (attr.container.image || attr.container.docker_image || attr.container.Image)) || null;
            // fallback: search entire egg JSON for a likely image string
            if (!dockerImage) dockerImage = findDockerImage(ep) || findDockerImage(attr) || null;

            // startup: try common locations
            startup = attr && (attr.startup || attr.startup_command || attr.startup_cmd) ? (attr.startup || attr.startup_command || attr.startup_cmd) : (plan.startup || '');
            feature_limits = attr && attr.feature_limits ? attr.feature_limits : null;
          }
        } catch (e) { console.error('Failed to fetch egg details', e); }

        // pick allocation — gather node allocation stats and find a free allocation
        let allocationId = null;
        const nodeStatuses = [];
        try {
          const nodesUrl = new URL('/api/application/nodes', base);
          const nodesResp = await doRequest(nodesUrl, { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
          const pn = JSON.parse(nodesResp.body || '{}');
          const nodeList = (pn && pn.data) || [];
          for (const n of nodeList) {
            const nid = (n && n.attributes && n.attributes.id) || n.id || null;
            const nName = (n && n.attributes && (n.attributes.name || n.attributes.fqdn)) || n.name || (`node-${nid}`);
            if (!nid) continue;
            try {
              const allocUrl = new URL(`/api/application/nodes/${nid}/allocations`, base);
              const allocResp = await doRequest(allocUrl, { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
              const pa = JSON.parse(allocResp.body || '{}');
              const allocList = (pa && pa.data) || [];
              let freeCount = 0;
              for (const a of allocList) {
                const aa = a.attributes || a;
                const isFree = aa && ((aa.assigned === false) || aa.server === null || aa['assigned'] === 0);
                if (isFree) {
                  freeCount += 1;
                  if (!allocationId) {
                    allocationId = aa.id || a.id || (aa.ip + ':' + aa.port);
                  }
                }
              }

              // Attempt to compute RAM usage on this node by listing servers on the node
              let nodeTotalRam = null;
              let nodeUsedRam = 0;
              try {
                nodeTotalRam = (n && n.attributes && (n.attributes.memory || n.attributes.memory_total || n.attributes.total_memory)) || null;
                // fetch servers on node to sum allocated RAM
                const srvUrl = new URL(`/api/application/nodes/${nid}/servers`, base);
                const srvResp = await doRequest(srvUrl, { method: 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
                const sv = JSON.parse(srvResp.body || '{}');
                const svList = (sv && sv.data) || [];
                for (const s of svList) {
                  const sat = s.attributes || s;
                  const lim = (sat && sat.limits && sat.limits.memory) || (sat && sat.attributes && sat.attributes.limits && sat.attributes.limits.memory) || (sat && sat.limits) || null;
                  const mem = Number(lim || 0);
                  if (!isNaN(mem)) nodeUsedRam += mem;
                }
              } catch (e) {
                // if we can't compute used RAM, leave nodeUsedRam as 0 and nodeTotalRam possibly null
                nodeUsedRam = nodeUsedRam || 0;
              }

              // decide if node has enough RAM for this plan
              const planRam = Number(plan && plan.ram) || 0;
              const availableRam = (nodeTotalRam !== null && !isNaN(Number(nodeTotalRam))) ? (Number(nodeTotalRam) - nodeUsedRam) : null;
              const ramOk = (availableRam === null) ? true : (availableRam >= planRam);

              nodeStatuses.push({ id: nid, name: nName, free: freeCount, total: allocList.length, ram_total: nodeTotalRam, ram_used: nodeUsedRam, ram_available: availableRam, ram_ok: ramOk });

              // choose allocation only if there is a free allocation AND RAM is sufficient (if known)
              if (allocationId && ramOk) break; // prefer first available allocation on a node with enough RAM
              // if allocationId found but this node lacks RAM, skip it and continue searching
              if (allocationId && !ramOk) allocationId = null;
            } catch (e) { console.error('Failed to fetch allocations for node', nid, e); nodeStatuses.push({ id: nid, name: nName, free: 0, total: 0, ram_ok: false }); }
          }
        } catch (e) { console.error('Failed to fetch allocations', e); }

        // if no allocation available across all nodes, mark error and return with friendly message showing node statuses
        if (!allocationId) {
          const totalFree = nodeStatuses.reduce((s, x) => s + (x.free || 0), 0);
          const noAllocMsg = { error: 'No allocation available on any node', nodes: nodeStatuses };
          try { await PlansDB.markOrderProvisionResult(orderId, null, noAllocMsg, 'error'); } catch (e) { console.error('Failed to mark no-allocation error', e); }
          const finalOrderNA = await PlansDB.getOrderById(orderId);
          panelUserAfter = await Users.findById(userId);
          if (totalFree === 0) {
            const details = nodeStatuses.map(n => `${n.name || n.id}: ${n.free || 0}/${n.total || 0} free`).join('; ');
            const notifyNA = { type: 'error', text: 'All nodes are full. Unable to provision at this time.', details };
            return res.render('store/checkout', { plan, success: true, order: finalOrderNA, notify: notifyNA, panelUser: panelUserAfter });
          }
          // otherwise something odd happened (we couldn't select allocation although some free slots exist)
          const notifyNA = { type: 'error', text: 'No allocation available to provision the server. Contact admin.', details: JSON.stringify(noAllocMsg) };
          return res.render('store/checkout', { plan, success: true, order: finalOrderNA, notify: notifyNA, panelUser: panelUserAfter });
        }

        // build environment variables for the server from plan and egg variables
        let environmentObj = {};
        try {
          // if plan has environment overrides (stored as JSON), merge them
          if (plan && plan.environment) {
            try {
              const pEnv = typeof plan.environment === 'string' ? JSON.parse(plan.environment) : plan.environment;
              if (pEnv && typeof pEnv === 'object') Object.assign(environmentObj, pEnv);
            } catch (e) { /* ignore invalid plan environment */ }
          }

          // find variable definitions in egg attributes
          const findVariableEntries = (obj, out = [], seen = new Set()) => {
            if (!obj || typeof obj !== 'object') return out;
            if (seen.has(obj)) return out; try { seen.add(obj); } catch (e) {}
            if (Array.isArray(obj)) {
              for (const v of obj) findVariableEntries(v, out, seen);
              return out;
            }
            // typical Pterodactyl variable object contains 'env_variable' or 'env' or 'variable'
            if (obj.env_variable || obj.env || obj.variable || obj.name) out.push(obj);
            for (const k of Object.keys(obj)) {
              findVariableEntries(obj[k], out, seen);
            }
            return out;
          };

    const varDefs = findVariableEntries(eggAttr || {}) || [];
          for (const v of varDefs) {
            const name = v.env_variable || v.env || v.variable || v.name;
            if (!name || typeof name !== 'string') continue;
            // prefer plan override, then variable default keys
            const def = v.default_value || v.default || v.value || v.env_value || null;
            if (environmentObj[name] === undefined || environmentObj[name] === null) {
              environmentObj[name] = (def !== null && def !== undefined) ? String(def) : undefined;
            }
          }

          // sensible fallbacks for commonly required fields
          if (!environmentObj['SERVER_JARFILE']) environmentObj['SERVER_JARFILE'] = environmentObj['SERVER_JARFILE'] || 'server.jar';
          if (!environmentObj['BUILD_NUMBER']) environmentObj['BUILD_NUMBER'] = environmentObj['BUILD_NUMBER'] || '0';
        } catch (e) {
          console.error('Failed to build environment variables from egg/plan', e);
        }

        // build server payload
        const payload = {
          name: server_name,
          user: pteroUserId || 1,
          egg: plan.egg || null,
          nest: plan.nest || null,
          docker_image: dockerImage || (plan.docker_image || null),
          environment: environmentObj,
          limits: { memory: Number(plan.ram) || 0, swap: 0, disk: Number(plan.disk) || 0, io: 500, cpu: Number(plan.cpu) || 0 },
          feature_limits: feature_limits || { databases: (plan.databases||0), backups: (plan.backups||0) },
          startup: startup || plan.startup || '',
          allocation: allocationId ? { default: allocationId } : undefined,
          start_on_completion: true
        };

        // create server
        try {
          const urlObj = new URL('/api/application/servers', base);
          const pteroResp = await doRequest(urlObj, { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' } }, JSON.stringify(payload));
          let parsed = {};
          try { parsed = JSON.parse(pteroResp.body || '{}'); } catch (e) { parsed = { raw: pteroResp.body }; }
          const serverId = (parsed && parsed.data && parsed.data.id) || (parsed && parsed.attributes && parsed.attributes.id) || parsed && parsed.id || null;
          if (pteroResp.status >= 200 && pteroResp.status < 300) {
            try { await PlansDB.markOrderProvisionResult(orderId, serverId, parsed, 'active'); } catch (e) { console.error('Failed to mark order provision result (active)', e); try { await PlansDB.updateOrderStatus(orderId, 'active'); } catch (ee) { console.error('Fallback updateOrderStatus failed', ee); } }
          } else {
            try { await PlansDB.markOrderProvisionResult(orderId, serverId, parsed, 'error'); } catch (e) { console.error('Failed to mark order provision result (error)', e); try { await PlansDB.updateOrderStatus(orderId, 'error'); } catch (ee) { console.error('Fallback updateOrderStatus failed', ee); } }
          }
        } catch (e) {
          console.error('Failed to create server on Pterodactyl', e);
          try { await PlansDB.markOrderProvisionResult(orderId, null, { error: String(e && e.message ? e.message : e) }, 'error'); } catch (ee) { /* ignore */ }
        }
      }

      // reload order and panel user for rendering
      const finalOrder = await PlansDB.getOrderById(orderId);
      panelUserAfter = panelUserAfter || await Users.findById(userId);

      // prepare notification
      let notify = null;
      try {
        if (finalOrder.status === 'active') notify = { type: 'success', text: 'Server created successfully and is active.' };
        else if (finalOrder.status === 'error') {
          let details = finalOrder.ptero_response || '';
          try { const p = JSON.parse(details); if (p && p.errors) details = JSON.stringify(p.errors, null, 2); else if (p && p.message) details = p.message; else details = JSON.stringify(p, null, 2); } catch (e) { }
          notify = { type: 'error', text: 'Provisioning failed. See details below.', details };
        } else notify = { type: 'info', text: `Order created with status: ${finalOrder.status || 'pending'}. Provisioning may still be in progress.` };
      } catch (e) { notify = { type: 'error', text: 'An unexpected error occurred while preparing notification.' }; }

      return res.render('store/checkout', { plan, success: true, order: finalOrder, notify, panelUser: panelUserAfter });
    } catch (e) {
      console.error(e);
      res.status(500).send('Failed to create order');
    }
}

module.exports = {
  showStore,
  showCheckout,
  postCheckout,
};
