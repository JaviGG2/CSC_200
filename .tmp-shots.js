const fs = require('fs');

const BASE = 'http://localhost:3102';
const CDP = 'http://127.0.0.1:9222';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function nuevaPagina() {
  const res = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' });
  return res.json();
}

function conectar(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pendientes = new Map();

    ws.addEventListener('open', () => {
      resolve({
        enviar(method, params = {}) {
          return new Promise((res, rej) => {
            const mid = ++id;
            pendientes.set(mid, { res, rej });
            ws.send(JSON.stringify({ id: mid, method, params }));
          });
        },
        cerrar: () => ws.close(),
      });
    });

    ws.addEventListener('message', (evento) => {
      const msg = JSON.parse(evento.data);
      if (!msg.id) return;
      const p = pendientes.get(msg.id);
      if (!p) return;
      pendientes.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    });

    ws.addEventListener('error', reject);
  });
}

(async () => {
  const pagina = await nuevaPagina();
  const cdp = await conectar(pagina.webSocketDebuggerUrl);

  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  const navegar = async (url) => {
    await cdp.enviar('Page.navigate', { url });
    await esperar(1200);
  };

  const evaluar = async (expresion) => {
    const r = await cdp.enviar('Runtime.evaluate', {
      expression: expresion,
      awaitPromise: true,
      returnByValue: true,
    });
    return r.result && r.result.value;
  };

  const captura = async (archivo) => {
    const r = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(archivo, Buffer.from(r.data, 'base64'));
    console.log('captura', archivo);
  };

  // Iniciar sesión
  await navegar(`${BASE}/login`);
  await evaluar(`(() => {
    document.querySelector('input[name="usuario"]').value = 'admin';
    document.querySelector('input[name="clave"]').value = 'csc200';
    document.querySelector('form').submit();
    return true;
  })()`);
  await esperar(1500);

  await navegar(`${BASE}/`);
  await esperar(1200);
  await captura('.tmp-home.png');

  await navegar(`${BASE}/viviendas/2`);
  await captura('.tmp-ficha.png');

  await navegar(`${BASE}/wizard`);
  await captura('.tmp-wizard.png');

  // Comportamiento del tipo de cédula en el wizard
  const resultadoCedula = await evaluar(`(() => {
    const select = document.getElementById('w-j-cedula-tipo');
    const numero = document.getElementById('w-j-cedula-numero');
    select.value = 'S';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return JSON.stringify({ deshabilitado: numero.disabled, obligatorio: numero.required, placeholder: numero.placeholder });
  })()`);
  console.log('tipo cedula wizard:', resultadoCedula);

  await cdp.cerrar();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
