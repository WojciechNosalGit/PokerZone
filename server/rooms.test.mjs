import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { createPokerServer } from './index.mjs';

async function player(address) {
  const socket = new WebSocket(address);
  const received = [];
  socket.on('message', data => received.push(JSON.parse(data.toString())));
  await once(socket, 'open');
  return {
    send(message) { socket.send(JSON.stringify(message)); },
    async find(predicate) {
      const deadline = Date.now() + 6000;
      do {
        const index = received.findIndex(predicate);
        if (index !== -1) return received.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 10));
      } while (Date.now() < deadline);
      assert.fail(`No matching response. Types received: ${received.map(message => message.type).join(', ')}`);
    },
    close() { socket.close(); return once(socket, 'close'); }
  };
}

const is = type => message => message.type === type;
const hand = (street, actor) => message => message.type === 'state' && message.connected
  && message.state?.street === street && !message.state.dealing && message.state.actor === actor;
const action = (client, snapshot, move) => client.send({ type: 'action', revision: snapshot.revision, action: move });

test('private table masks cards, enforces turns, reconnects seats and pays out', async t => {
  const instance = createPokerServer();
  t.after(() => instance.close());
  const { server } = instance;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const http = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${http}/health`)).status, 200);
  assert.equal((await fetch(`${http}/server/rooms.mjs`)).status, 404);
  const page = await fetch(http);
  const html = await page.text();
  assert.match(html, /name="pokerzone-online-url" content="\/ws"/);
  assert.equal(Number((await fetch(http, { method: 'HEAD' })).headers.get('content-length')), Buffer.byteLength(html));
  const address = http.replace('http:', 'ws:') + '/ws';

  const host = await player(address);
  host.send({ type: 'create', name: 'Wojtek', bigBlind: 20 });
  const invitation = await host.find(is('seat'));
  assert.equal(invitation.seat, 0);
  assert.equal((await host.find(is('state'))).state, null);
  let guest = await player(address);
  guest.send({ type: 'join', room: invitation.room, name: 'Ola' });
  const guestSeat = await guest.find(is('seat'));
  assert.equal(guestSeat.seat, 1);
  assert.notEqual(guestSeat.token, invitation.token);

  const third = await player(address);
  third.send({ type: 'join', room: invitation.room, name: 'Trzeci' });
  assert.match((await third.find(is('error'))).message, /pełny/);
  third.send({ type: 'resume', room: invitation.room, token: 'inny-token' });
  assert.equal((await third.find(is('error'))).code, 'resume');
  await third.close();

  const hostTurn = await host.find(hand('preflop', 0));
  const guestView = await guest.find(hand('preflop', 1));
  assert.equal(hostTurn.state.smallBlind, 10);
  assert.equal(hostTurn.state.bigBlind, 20);
  assert.deepEqual(hostTurn.state.players.map(player => player.name), ['Wojtek', 'Ola']);
  assert.deepEqual(guestView.state.players.map(player => player.name), ['Ola', 'Wojtek']);
  for (const snapshot of [hostTurn, guestView]) {
    assert.equal(snapshot.state.deck, undefined);
    assert.equal(snapshot.state.heroHand, undefined);
    assert.deepEqual(snapshot.state.players[1].hand, [null, null]);
    assert.equal(snapshot.state.players[0].hand.filter(Boolean).length, 2);
    assert.equal('token' in snapshot, false);
  }
  assert.equal(new Set([...hostTurn.state.players[0].hand, ...guestView.state.players[0].hand]
    .map(card => `${card.r}${card.s}`)).size, 4);
  action(guest, guestView, 'call');
  assert.match((await guest.find(is('error'))).message, /niedostępny/);
  action(host, hostTurn, 'call');
  action(host, hostTurn, 'call');
  assert.match((await host.find(is('error'))).message, /zmieniła/);
  const guestTurn = await guest.find(hand('preflop', 0));
  await guest.close();
  await host.find(message => message.type === 'state' && message.state && !message.connected);
  guest = await player(address);
  guest.send({ type: 'resume', room: invitation.room, token: guestSeat.token });
  assert.equal((await guest.find(is('seat'))).seat, 1);
  const recovered = await guest.find(hand('preflop', 0));
  assert.deepEqual(recovered.state.players[0].hand, guestTurn.state.players[0].hand);
  assert.equal(recovered.state.handNo, guestTurn.state.handNo);
  action(guest, recovered, 'call');

  for (const street of ['flop', 'turn', 'river']) {
    const first = await guest.find(hand(street, 0));
    action(guest, first, 'call');
    const second = await host.find(hand(street, 0));
    action(host, second, 'call');
  }
  const result = message => message.type === 'state' && message.state?.phase === 'finished';
  const [hostResult, guestResult] = await Promise.all([host.find(result), guest.find(result)]);
  assert.equal(hostResult.state.board.length, 5);
  assert.deepEqual(hostResult.state.board, guestResult.state.board);
  assert.deepEqual(hostResult.state.players[1].hand, guestResult.state.players[0].hand);
  assert.equal(hostResult.payouts.reduce((sum, [, amount]) => sum + amount, 0), 40);
  assert.equal(hostResult.state.players.reduce((sum, player) => sum + player.stack, 0), 4000);
  guest.send({ type: 'leave' });
  assert.equal((await host.find(is('closed'))).message, 'Gracz opuścił stół online.');
});

test('one invitation seats up to eight players and starts only when the table is full', async t => {
  const instance = createPokerServer();
  t.after(() => instance.close());
  const { server } = instance;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = `ws://127.0.0.1:${server.address().port}/ws`;
  const host = await player(address);
  host.send({ type: 'create', name: 'Gracz 1', bigBlind: 4, playerCount: 9 });
  assert.match((await host.find(is('error'))).message, /od 2 do 8/);
  const count = 8;
  host.send({ type: 'create', name: 'Gracz 1', bigBlind: 4, playerCount: count });
  const { room } = await host.find(is('seat'));
  const clients = [host];
  const names = Array.from({ length: count }, (_, index) => `Gracz ${index + 1}`);
  const waiting = present => message => message.type === 'state' && message.present === present && message.state === null;
  for (let seat = 1; seat < count; seat++) {
    const lobby = await host.find(waiting(seat));
    assert.equal(lobby.playerCount, count);
    assert.equal(lobby.connected, false);
    const guest = await player(address);
    guest.send({ type: 'join', name: names[seat], room });
    assert.equal((await guest.find(is('seat'))).seat, seat);
    clients.push(guest);
  }

  const ready = message => message.type === 'state' && message.state && !message.state.dealing;
  const first = await Promise.all(clients.map(client => client.find(ready)));
  for (const [seat, snapshot] of first.entries()) {
    assert.equal(snapshot.present, count);
    assert.equal(snapshot.connected, true);
    assert.equal((snapshot.state.actor + seat) % count, first[0].state.actor);
    assert.equal((snapshot.state.dealer + seat) % count, first[0].state.dealer);
    assert.deepEqual(snapshot.state.players.map(player => player.name), [...names.slice(seat), ...names.slice(0, seat)]);
    assert.equal(snapshot.state.players[0].hand.filter(Boolean).length, 2);
    for (const player of snapshot.state.players.slice(1)) assert.deepEqual(player.hand, [null, null]);
  }

  let revision = first[0].revision - 1;
  for (let index = 0; index < count - 1; index++) {
    const turn = index === 0 ? first[0] : await host.find(message => ready(message) && message.revision > revision);
    const seat = turn.state.actor;
    revision = turn.revision;
    action(clients[seat], turn, 'fold');
  }
  const finished = message => message.type === 'state' && message.state?.phase === 'finished';
  const [hostResult, lastResult] = await Promise.all([host.find(finished), clients.at(-1).find(finished)]);
  const [[winner, amount]] = hostResult.payouts;
  assert.equal(amount, 6);
  assert.deepEqual(lastResult.payouts, [[(winner + 1) % count, amount]]);
  assert.equal(hostResult.state.players.reduce((sum, player) => sum + player.stack, 0), count * 400);
});
