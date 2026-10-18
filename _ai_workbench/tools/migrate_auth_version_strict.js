const accounts = db.getCollection('accounts');
const missingBefore = accounts.count({ authVersion: { $exists: false } });
const invalidBefore = accounts.count({ authVersion: { $lt: 1 } });
const result = accounts.updateMany(
  { $or: [{ authVersion: { $exists: false } }, { authVersion: { $lt: 1 } }] },
  { $set: { authVersion: 1 } }
);
const missingAfter = accounts.count({ authVersion: { $exists: false } });
const invalidAfter = accounts.count({ authVersion: { $lt: 1 } });
printjson({ missingBefore, invalidBefore, matched: result.matchedCount, modified: result.modifiedCount, missingAfter, invalidAfter });
