const jwtVerifier = require('express-jwt');
const { Router } = require('express');
const fetch = require('node-fetch');
const Transaction = require('../models/transaction');
const User = require('../models/user');

const router = Router();

const secret = process.env.ACCESS_TOKEN_SECRET;
const { API_PROD_URL, API_PROD_KEY } = process.env;

const order = async (req, res) => {
  try {
    const {
      shares, symbol, type,
    } = req.body;

    const url = new URL(`${API_PROD_URL}/stock/${symbol}/batch`);
    url.searchParams.append('types', 'quote,company');
    url.searchParams.append('token', API_PROD_KEY);

    const data = await (await fetch(url)
      .then((response) => {
        if (!response.ok) {
          switch (response.status) {
            case 401:
              throw Error(`The stock ${symbol} you are searching for does not exist`);
            default:
              throw Error('Oop! there is something wrong with our app');
          }
        }
        return response.json();
      })
    );

    const { id } = req.user;
    const price = data.quote.latestPrice;
    const { sector } = data.company;
    const user = await User.findById(id);
    const { investments, balance } = user;
    const originalStock = investments
      .filter((investment) => investment.symbol === symbol)[0];
    let originalShares = 0;
    if (originalStock) {
      originalShares = originalStock.shares;
    }
    // compare shares with orginalShares
    let updatedBalance = 0;
    let updatedShares = 0;
    const stockTotalValue = shares * price;
    if (type === 'buy') {
      if (balance >= stockTotalValue) {
        updatedBalance = balance - stockTotalValue;
        updatedShares = originalShares + shares;
        // update User balance / investment shares & set status to 'settled'
        try {
          const orderTransaction = new Transaction(
            {
              user: id,
              shares,
              price,
              symbol,
              type,
              status: 'settled',
            },
          );
          orderTransaction.save();
          await User.updateOne({ _id: id }, { $set: { balance: updatedBalance } });
          const stock = await User.find({ _id: id, 'investments.symbol': symbol });
          if (stock.length > 0) {
            await User.updateMany(
              { _id: id, 'investments.symbol': symbol },
              {
                $set: {
                  'investments.$.shares': updatedShares,
                  'investments.$.sector': sector,
                },
                $inc: {
                  'investments.$.entryPrice': price * shares,
                },
              },
            );
          } else {
            const newInvestment = {
              symbol,
              shares: updatedShares,
              sector,
              entryPrice: price * shares,
            };
            await User.updateOne({ _id: id }, { $push: { investments: newInvestment } });
          }
          res.status(201).json('save and update successfully');
        } catch (error) {
          console.error(error);
          return res.sendStatus(500);
        }
      } else {
        // failed
        try {
          const orderTransaction = new Transaction(
            {
              user: id,
              shares,
              price,
              symbol,
              type,
              status: 'failed',
            },
          );
          orderTransaction.save();
          // throw error('balance is not enough');
          throw new Error('Your balance is not enough');
        } catch (error) {
          return res.status(400).send({ message: error.message });
        }
      }
    } else if (type === 'sell') {
      if (originalShares >= shares) {
        updatedBalance = balance + stockTotalValue;
        updatedShares = originalShares - shares;
        // update User balance / investment shares & set status to 'settled'
        try {
          const orderTransaction = new Transaction(
            {
              user: id,
              shares,
              price,
              symbol,
              type,
              status: 'settled',
            },
          );
          orderTransaction.save();
          await User.updateOne({ _id: id }, { $set: { balance: updatedBalance } });
          await User.updateMany(
            { _id: id, 'investments.symbol': symbol },
            {
              $set: {
                'investments.$.shares': updatedShares,
                'investments.$.sector': sector,
              },
              $inc: {
                'investments.$.entryPrice': -(shares * price),
              },
            },
            { upsert: true },
          );
          res.status(201).json('create and update successfully');
        } catch (error) {
          console.error(error);
          return res.sendStatus(500);
        }
      } else {
        // failed
        try {
          const orderTransaction = new Transaction(
            {
              user: id,
              shares,
              price,
              symbol,
              type,
              status: 'failed',
            },
          );
          orderTransaction.save();
          // throw error ('stock shares are not enough');
          throw new Error('Your stock shares are fewer than what you have');
        } catch (error) {
          console.error(error);
          return res.status(400).send({ message: error.message });
        }
      }
    }
    res.status(201);
  } catch (error) {
    console.error(error);
    res.status(500);
  }
};

router.post('/', jwtVerifier({ secret }), order);

module.exports = router;
