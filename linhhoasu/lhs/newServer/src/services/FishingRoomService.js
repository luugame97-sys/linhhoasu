'use strict';

// One registry per game WebSocket server. Membership is transient; inventory is not.
const CAPACITY = 4;
const MAX_ROOMS = 4096;
const SEATS = [1, 0, 3, 2]; // Native supports 0..3, not 1..4.
const copy = value => JSON.parse(JSON.stringify(value));
const validRoom = id => Number.isSafeInteger(id) && id >= 1 && id <= MAX_ROOMS;

class FishingRoomService {
  constructor() {
    this.rooms = new Map();
    this.members = new Map();
    this.users = new Map();
    this.queue = Promise.resolve();
  }

  run(work) {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }

  connected(session) {
    return !!session.player && !session._closing && session._fishConnected !== false;
  }

  key(mapId, roomId) { return `${mapId}:${roomId}`; }

  roomList(mapId) {
    return [...this.rooms.values()].filter(r => r.mapId === mapId).sort((a, b) => a.id - b.id);
  }

  firstUnused(mapId) {
    for (let id = 1; id <= MAX_ROOMS; id++) if (!this.rooms.has(this.key(mapId, id))) return id;
    return 0;
  }

  publicPlayer(member) {
    const info = member.session.player?.fishInfo || {};
    return { ...copy(member.player), pos: member.pos,
      rodId: info.rodId || member.player.rodId, raftId: info.raftId || member.player.raftId,
      food: info.food || member.player.food };
  }

  send(session, packets) {
    if (this.connected(session) && typeof session._fishSend === 'function') session._fishSend(packets);
  }

  isMember(session) {
    const member = this.members.get(session);
    return !!(
      member
      && member.session === session
      && member.room
      && member.room.members
      && member.room.members.get(session) === member
    );
  }

  rememberResponse(session, packet) {
    // This handler sends under its room queue, before WSServer's normal result
    // path. Preserve that path's duplicate-RPC protection with the same ACK cache.
    if (!packet.msgUid || !session._responseCache) return;
    session._responseCache.set(`${packet.tag}:${packet.msgUid}`, packet);
    while (session._responseCache.size > 100) {
      session._responseCache.delete(session._responseCache.keys().next().value);
    }
  }

  broadcastRoom(room, except, tag, data) {
    const packet = { tag, msgUid: 0, data: { ...data, mapId: room.mapId, roomId: room.id } };
    for (const member of room.members.values()) if (member.session !== except) this.send(member.session, packet);
  }

  broadcast(session, tag, data) {
    const member = this.members.get(session);
    if (member && this.connected(session)) this.broadcastRoom(member.room, session, tag, data);
  }

  release(session) {
    const member = this.members.get(session);
    if (!member) return;
    this.members.delete(session);
    if (this.users.get(session.userId) === member) this.users.delete(session.userId);
    member.room.members.delete(session);
    session._fishRoomMapId = 0; session._fishRoomId = 0; session._fishRoomPos = null;
    this.broadcastRoom(member.room, session, 4052, { id: member.player.dbid });
    if (!member.room.members.size) this.rooms.delete(this.key(member.room.mapId, member.room.id));
  }

  disconnect(session) {
    // Identity based: a stale socket cannot release the replacement session's seat.
    this.release(session);
  }

  prune() {
    for (const session of this.members.keys()) if (!this.connected(session)) this.release(session);
  }

  list(session, mapId, page = 0) {
    this.prune();
    const rooms = this.roomList(mapId), spare = this.firstUnused(mapId);
    if (spare) rooms.push({ id: spare, mapId, members: new Map() });
    rooms.sort((a, b) => a.id - b.id);
    const totalPages = Math.max(1, Math.ceil(rooms.length / 4));
    const index = Math.min(totalPages - 1, Math.max(0, Number.isSafeInteger(page) ? page : 0));
    const current = this.members.get(session);
    return { result: 0, roomProtocol: 1, mapId, capacity: CAPACITY, page: index, totalPages,
      currentRoomId: current?.room.mapId === mapId ? current.room.id : 0,
      rooms: rooms.slice(index * 4, index * 4 + 4).map(room => ({
        id: room.id, count: room.members.size, capacity: CAPACITY,
        players: [...room.members.values()].map(m => ({ name: String(m.player.name || ''), pos: m.pos })),
      })) };
  }

  async enter(session, mapId, requestedRoom, persist, buildPlayer, tag, msgUid) {
    return this.run(async () => {
      this.prune();
      const fail = reason => ({ tag, msgUid, data: { result: 1, reason, id: session.player?.fishInfo?.scene || 1 } });
      if (!this.connected(session)) return fail('FISH_ROOM_SESSION_CLOSED');
      if (requestedRoom != null && !validRoom(requestedRoom)) return fail('FISH_ROOM_INVALID');
      const current = this.members.get(session);
      let room = requestedRoom != null ? this.rooms.get(this.key(mapId, requestedRoom))
        : (current?.room.mapId === mapId ? current.room : this.roomList(mapId).find(r => r.members.size < CAPACITY));
      const roomId = room?.id || requestedRoom || this.firstUnused(mapId);
      if (!room && roomId !== this.firstUnused(mapId)) return fail('FISH_ROOM_NOT_FOUND');
      if (!validRoom(roomId)) return fail('FISH_ROOMS_FULL');
      const same = !!current && current.room === room;
      if (!same && room && room.members.size >= CAPACITY) return fail('FISH_ROOM_FULL');
      const occupied = new Set(room ? [...room.members.values()].map(m => m.pos) : []);
      const pos = same ? current.pos : SEATS.find(p => !occupied.has(p));
      const self = buildPlayer(pos);
      // Queue covers the confirmed save: parallel users cannot reserve the same seat.
      try { await persist(); } catch (error) { this.release(session); throw error; }
      if (!this.connected(session)) { this.release(session); return fail('FISH_ROOM_SESSION_CLOSED'); }
      const duplicate = this.users.get(session.userId);
      if (duplicate && duplicate.session !== session) this.release(duplicate.session);
      if (!same) this.release(session);
      if (!room || !this.rooms.has(this.key(mapId, room.id))) {
        room = { id: roomId, mapId, time: Math.floor(Date.now() / 1000), members: new Map() };
        this.rooms.set(this.key(mapId, roomId), room);
      }
      const member = { session, room, pos, player: self };
      room.members.set(session, member); this.members.set(session, member); this.users.set(session.userId, member);
      session._fishRoomMapId = mapId; session._fishRoomId = roomId; session._fishRoomPos = pos;
      const info = session.player.fishInfo;
      const entry = { tag: 4050, msgUid: 0, data: {
        mapId, roomId, roomProtocol: 1, capacity: CAPACITY, pos, time: room.time,
        food: info.food, rodId: info.rodId, raftId: info.raftId,
        players: [...room.members.values()].filter(m => m.session !== session).map(m => this.publicPlayer(m)),
      } };
      const ack = { tag, msgUid, data: { result: 0, id: mapId, roomId } };
      const packets = tag === 4002 ? [ack, entry] : [entry, ack];
      this.rememberResponse(session, ack);
      // Send under the queue so a later join notification cannot overtake the roster.
      this.send(session, packets);
      if (!same) this.broadcastRoom(room, session, 4051, { mapPlayer: this.publicPlayer(member) });
      return typeof session._fishSend === 'function' ? null : packets;
    });
  }

  async leave(session, persist, tag, msgUid) {
    return this.run(async () => {
      try { await persist(); } catch (error) { this.release(session); throw error; }
      this.release(session);
      const packet = { tag, msgUid, data: { result: 0 } };
      this.rememberResponse(session, packet);
      this.send(session, packet);
      return typeof session._fishSend === 'function' ? null : packet;
    });
  }
}

module.exports = { FishingRoomService, CAPACITY };
