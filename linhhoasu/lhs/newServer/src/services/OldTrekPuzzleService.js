'use strict';
// Owner-approved compatible puzzle, not CN triangular-mosaic mechanics.
// 3x3 sliding board: server reproduces the board and validates every move.
function board(seed) {
  const tiles = [1,2,3,4,5,6,7,8,0]; let empty = 8, last = -1, value = Number(seed) >>> 0;
  for (let i = 0; i < 48; i++) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const choices = [empty-3,empty+3,empty-1,empty+1].filter(j => j >= 0 && j < 9 && j !== last && Math.abs(j%3-empty%3)+Math.abs(Math.floor(j/3)-Math.floor(empty/3)) === 1);
    const at = choices[value % choices.length]; [tiles[empty],tiles[at]] = [tiles[at],tiles[empty]]; last=empty; empty=at;
  }
  return tiles;
}
function validate(seed, moves) {
  if (!Array.isArray(moves) || !moves.length || moves.length > 512) return false;
  const tiles = board(seed); let empty = tiles.indexOf(0);
  for (const at of moves) {
    if (!Number.isInteger(at) || at < 0 || at > 8 || Math.abs(at%3-empty%3)+Math.abs(Math.floor(at/3)-Math.floor(empty/3)) !== 1) return false;
    [tiles[empty],tiles[at]]=[tiles[at],tiles[empty]]; empty=at;
  }
  return tiles.every((n,i)=>n===(i+1)%9);
}
module.exports = { board, validate };
