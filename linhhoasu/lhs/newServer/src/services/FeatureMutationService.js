'use strict';

const playerMutation = require('./PlayerMutationService');
const playerService = require('./PlayerService');
const runtimeBus = require('./RuntimeBus');

// Feature handlers work on a private snapshot and publish it only after the
// persistence layer confirms the save.  This keeps task progress and rewards
// atomic when a request is retried or the save result is uncertain.
function wrap(handler) {
  return function featureMutation(params, session, msgUid) {
    return playerMutation.run(session && session.userId, async () => {
      if (!session || !session.player) return handler(params, session, msgUid);
      const ws = runtimeBus.getWsServer();
      const canonical = ws && ws.getPlayerForMutation
        ? (ws.getPlayerForMutation(session.userId) || session.player)
        : session.player;
      if (playerService.drainPendingSaves) await playerService.drainPendingSaves(session.userId);
      const draftSession = Object.assign(Object.create(Object.getPrototypeOf(session)), session, {
        player: JSON.parse(JSON.stringify(canonical)),
        _featureMutationSaved: false,
      });
      try {
        const response = await handler(params, draftSession, msgUid);
        if (draftSession._featureMutationSaved) {
          Object.assign(canonical, draftSession.player);
          session.player = canonical;
        }
        return response;
      } catch (error) {
        if (ws && ws.invalidatePlayerForMutation) ws.invalidatePlayerForMutation(session.userId);
        session.player = null;
        throw error;
      }
    });
  };
}

async function save(session, player) {
  const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });
  if (!saved) throw new Error('FEATURE_SAVE_NOT_CONFIRMED');
  session.player = player;
  session._featureMutationSaved = true;
  return saved;
}

module.exports = { wrap, save };
