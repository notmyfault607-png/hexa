const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authMiddleware = require('../middleware/auth');
const contactService = require('../services/contactService');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const contacts = await contactService.getContacts(req.userId);
    res.json({ success: true, contacts });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/', [body('contactUserId').isUUID()], validate, async (req, res) => {
  try {
    const contact = await contactService.addContact(req.userId, req.body.contactUserId);
    res.json({ success: true, contact });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:contactId', async (req, res) => {
  try {
    const result = await contactService.removeContact(req.userId, req.params.contactId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:contactId/favorite', async (req, res) => {
  try {
    const contact = await contactService.toggleFavorite(req.userId, req.params.contactId);
    res.json({ success: true, contact });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/block', [body('blockedUserId').isUUID()], validate, async (req, res) => {
  try {
    const result = await contactService.blockUser(req.userId, req.body.blockedUserId);
    res.json({ success: true, blocked: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/block/:blockedUserId', async (req, res) => {
  try {
    const result = await contactService.unblockUser(req.userId, req.params.blockedUserId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/blocked/list', async (req, res) => {
  try {
    const blocked = await contactService.getBlockedUsers(req.userId);
    res.json({ success: true, blocked });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/block/status/:userId', async (req, res) => {
  try {
    const status = await contactService.getBlockStatus(req.userId, req.params.userId);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
