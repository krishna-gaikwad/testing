/**
 * Server-Sent Events (SSE) Hub
 * Real-time event broadcasting for civic grievance updates
 */

class SseHub {
  constructor() {
    this.clients = new Set();
  }

  addClient(res) {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  broadcast(eventData) {
    const payload = `data: ${JSON.stringify(eventData)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (e) {
        this.clients.delete(client);
      }
    }
  }

  get clientCount() {
    return this.clients.size;
  }
}

const sseHub = new SseHub();

module.exports = { sseHub };
