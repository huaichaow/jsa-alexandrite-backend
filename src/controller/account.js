const express = require('express');
const jwtVerifier = require('express-jwt');

const secret = process.env.ACCESS_TOKEN_SECRET;

const account = express.Router();
const { User } = require('../models');
const { Transaction } = require('../models');

account.get('/user', jwtVerifier({ secret }), async (req, res) => {
  try {
    const { id } = req.user;
    const user = await User.find({ _id: id }, '-_id username balance');
    return res.send(user);
  } catch (err) {
    return res.sendStatus(500);
  }
});

account.post('/topup', jwtVerifier({ secret }), async (req, res) => {
  try {
    const { id } = req.user;
    const { topUp } = req.body;
    const balance = await User.findById(id, 'balance');
    const result = balance.balance + topUp;
    try {
      await User.updateOne({ _id: id }, { $set: { balance: result } });
      const topUpTransaction = new Transaction({
        user: id,
        amount: topUp,
        type: 'topUp',
        status: 'settled',
      });
      await topUpTransaction.save();
      return res.json({ balance: result });
    } catch (err) {
      return res.sendStatus(500);
    }
  } catch (err) {
    return res.sendStatus(500);
  }
});

module.exports = account;
