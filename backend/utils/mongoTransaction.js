const mongoose = require('mongoose');

class TransactionUnavailableError extends Error {
  constructor(message = 'Global Table writes require MongoDB transactions (replica set or mongos)') {
    super(message);
    this.name = 'TransactionUnavailableError';
    this.statusCode = 503;
    this.isTransactionUnavailable = true;
  }
}

let transactionSupport;

const transactionsSupported = async () => {
  if (!mongoose.connection.readyState || !mongoose.connection.db) return false;
  if (!transactionSupport) {
    const admin = mongoose.connection.db.admin();
    transactionSupport = admin.command({ hello: 1 })
      .catch(() => admin.command({ isMaster: 1 }))
      .then((info) => Boolean(info.setName) || info.msg === 'isdbgrid')
      .catch((err) => {
        transactionSupport = null;
        throw new TransactionUnavailableError(`Unable to verify MongoDB transaction support: ${err.message}`);
      });
  }
  return transactionSupport;
};

const runAfterCommit = async (callbacks) => {
  for (const callback of callbacks) {
    try {
      await callback();
    } catch (err) {
      console.error('Post-commit action failed:', err);
    }
  }
};

const withMongoTransaction = async (work, { fallback } = {}) => {
  if (!(await transactionsSupported())) {
    if (typeof fallback === 'function') return fallback();
    throw new TransactionUnavailableError();
  }

  const session = await mongoose.startSession();
  let result;
  let callbacks = [];
  try {
    await session.withTransaction(
      async () => {
        callbacks = [];
        result = await work(session, callbacks);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
    );
  } finally {
    await session.endSession();
  }

  await runAfterCommit(callbacks);
  return result;
};

module.exports = { withMongoTransaction, TransactionUnavailableError };