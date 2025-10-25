const PlansDB = require('../db/plans');

async function index(req, res) {
  try {
    const plans = await PlansDB.getPlans();
    res.render('admin/plans', { plans });
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to load plans');
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const plan = {
      name: String(body.name || '').trim(),
      egg: String(body.egg || '').trim(),
      nest: String(body.nest || '').trim(),
      ram: parseInt(body.ram) || 0,
      disk: parseInt(body.disk) || 0,
      cpu: parseInt(body.cpu) || 0,
      billing_cycle: String(body.billing_cycle || 'monthly'),
      price: parseFloat(body.price) || 0,
    };

    if (!plan.name) return res.status(400).send('Plan name is required');

    await PlansDB.createPlan(plan);
    res.redirect('/admin/plans');
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to create plan');
  }
}

async function remove(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.redirect('/admin/plans');
    await PlansDB.deletePlan(id);
    res.redirect('/admin/plans');
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to delete plan');
  }
}

module.exports = {
  index,
  create,
  remove,
};
