import dgram from 'node:dgram';

export function createUdpListener(host = '127.0.0.1', port = 5300) {
  const server = dgram.createSocket('udp4');
  let onData = null;

  server.on('message', (msg) => {
    if (msg.length >= 323 && onData) {
      onData(msg);
    }
  });

  server.on('error', (err) => {
    console.error(`UDP error: ${err.message}`);
    server.close();
  });

  return {
    start() {
      return new Promise((resolve, reject) => {
        try {
          server.bind(port, host, () => {
            resolve();
          });
        } catch (err) {
          reject(err);
        }
      });
    },
    stop() {
      server.close();
    },
    onMessage(callback) {
      onData = callback;
    },
    get address() {
      try {
        return server.address();
      } catch {
        return null;
      }
    }
  };
}
