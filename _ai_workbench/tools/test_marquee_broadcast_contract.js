'use strict';

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const runtimeBus = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/RuntimeBus'));
const chat = require(path.join(root, 'linhhoasu/lhs/newServer/src/handlers/chat'));

let captured = null;
runtimeBus.setWsServer({
  broadcast(tag, data) {
    captured = { tag, data };
    return 3;
  },
});

try {
  const output = chat.pushMarqueeBroadcast('Xin chào <script>alert(1)</script> | đạo hữu', {
    style: {
      color: '#12abef',
      size: 32,
      bold: true,
      italic: true,
      underline: true,
      fontFamily: 'Arial',
      stroke: 3,
      strokeColor: '#220011',
    },
  });
  assert(output, 'no marquee output');
  assert.strictEqual(output.recipients, 3);
  assert.strictEqual(captured.tag, 1601);
  assert.strictEqual(captured.data.channel, 1);
  // Client maps server msgType=16 to chat type 19, the native marquee path.
  assert.strictEqual(captured.data.data.msgType, 16);
  assert.strictEqual(captured.data.data.sys, true);
  assert(output.markup.includes('|C:0x12ABEF'));
  assert(output.markup.includes('&S:32'));
  assert(output.markup.includes('&R:3'));
  assert(output.markup.includes('&K:0x220011'));
  assert(output.markup.includes('bold="true"'));
  assert(output.markup.includes('italic="true"'));
  assert(output.markup.includes('u="true"'));
  assert(output.markup.includes('fontfamily="Arial"'));
  assert(!output.markup.includes('<script>'));
  assert(output.markup.includes('&lt;script&gt;'));
  assert(!output.markup.includes(' | '));

  const clamped = chat.normalizeMarqueeStyle({ color: 'bad', size: 999, stroke: -2, fontFamily: 'url(evil)' });
  assert.strictEqual(clamped.color, '0xFFFFFF');
  assert.strictEqual(clamped.size, 40);
  assert.strictEqual(clamped.stroke, 0);
  assert.strictEqual(clamped.fontFamily, '');

  const long = 'a'.repeat(250);
  const markup = chat.buildMarqueeMarkup(long, {});
  const body = markup.split('&T:')[1];
  assert.strictEqual(body.length, 200);

  console.log(JSON.stringify({ result: 'PASS', checks: 22, tag: captured.tag, recipients: output.recipients, markup: output.markup }));
} finally {
  runtimeBus.setWsServer(null);
}
