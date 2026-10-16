/** Each request owns a port, so concurrent saves cannot consume each other's reply.
 * The deadline includes waiting for a registration, and closes the port on every exit.
 * @param {object} message @param {string} done
 * @param {{worker?: ServiceWorkerContainer, timeout?: number}} [options]
 * @returns {Promise<any>} */
export function askWorker(message, done, { worker = navigator.serviceWorker, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('this browser cannot save for offline')); return; }
    const channel = new MessageChannel();
    let settled = false;
    /** @param {unknown} [error] @param {any} [data] */
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      if (error) reject(error); else resolve(data);
    };
    const timer = setTimeout(() => finish(new Error('the offline store did not answer')), timeout);
    channel.port1.onmessage = ({ data }) => {
      if (data?.type === done) finish(data.error ? new Error(data.error) : undefined, data);
    };
    worker.ready.then((registration) => {
      if (settled) return;
      if (!registration.active) throw new Error('the offline store has no active worker');
      registration.active.postMessage(message, [channel.port2]);
    }).catch((error) => finish(error));
  });
}
