// Thin wrapper around PeerJS (loaded globally via CDN). Host-authoritative star topology.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIX = 'gradebattle-';   // Custom-ID namespace to reduce broker collisions.

function makeCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

export function createHost({ onPlayerJoin, onPlayerLeave, onMessage, onError, displayName }) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') { reject(new Error('PeerJS not loaded')); return; }
    let tries = 0;
    function attempt() {
      tries++;
      const code = makeCode();
      const peer = new Peer(PREFIX + code, { debug: 0 });
      const connections = new Map();   // peerId -> { conn, name }
      let resolved = false;

      const api = {
        code,
        peer,
        get connectionCount() { return connections.size; },
        get peers() {
          return [...connections.entries()].map(([pid, info]) => ({ peerId: pid, name: info.name }));
        },
        broadcast(msg) {
          const data = JSON.stringify(msg);
          for (const { conn } of connections.values()) {
            try { conn.send(data); } catch (e) {}
          }
        },
        sendTo(peerId, msg) {
          const info = connections.get(peerId);
          if (info && info.conn) try { info.conn.send(JSON.stringify(msg)); } catch (e) {}
        },
        close() {
          for (const { conn } of connections.values()) try { conn.close(); } catch (e) {}
          try { peer.destroy(); } catch (e) {}
        }
      };

      peer.on('open', () => {
        if (!resolved) { resolved = true; resolve(api); }
      });
      peer.on('error', (err) => {
        if (!resolved) {
          // ID taken? try a different code.
          if ((err && err.type === 'unavailable-id') && tries < 5) {
            try { peer.destroy(); } catch (e) {}
            attempt();
          } else {
            resolved = true;
            reject(err);
          }
        } else if (onError) {
          onError(err);
        }
      });
      peer.on('connection', (conn) => {
        const peerId = conn.peer;
        connections.set(peerId, { conn, name: 'Spieler' });
        conn.on('data', (raw) => {
          let msg;
          try { msg = JSON.parse(raw); } catch (e) { return; }
          if (msg.type === 'hello') {
            const info = connections.get(peerId);
            if (info) info.name = msg.name || 'Spieler';
          }
          onMessage && onMessage(peerId, msg);
          if (msg.type === 'hello') onPlayerJoin && onPlayerJoin(peerId, msg.name || 'Spieler');
        });
        conn.on('close', () => {
          connections.delete(peerId);
          onPlayerLeave && onPlayerLeave(peerId);
        });
        conn.on('error', () => {
          connections.delete(peerId);
          onPlayerLeave && onPlayerLeave(peerId);
        });
      });
    }
    attempt();
  });
}

export function joinHost({ code, name, onMessage, onClose, onError }) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') { reject(new Error('PeerJS not loaded')); return; }
    const peer = new Peer(undefined, { debug: 0 });
    let connection = null;
    let resolved = false;
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => {
        connection = conn;
        conn.send(JSON.stringify({ type: 'hello', name }));
        if (!resolved) { resolved = true; resolve({
          code, peer, conn,
          send(msg) { try { conn.send(JSON.stringify(msg)); } catch (e) {} },
          close() { try { conn.close(); peer.destroy(); } catch (e) {} }
        }); }
      });
      conn.on('data', (raw) => {
        let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
        onMessage && onMessage(msg);
      });
      conn.on('close', () => onClose && onClose());
      conn.on('error', (e) => onError && onError(e));
    });
    peer.on('error', (err) => {
      if (!resolved) { resolved = true; reject(err); }
      else onError && onError(err);
    });
  });
}
