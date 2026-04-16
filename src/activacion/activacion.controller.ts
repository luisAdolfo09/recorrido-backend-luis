import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/public.decorator';

/**
 * Controlador que sirve una página HTML pura para activar/restablecer contraseña.
 * 
 * RAZÓN DE EXISTIR:
 * El frontend (Vercel) tiene "Deployment Protection" que bloquea el acceso
 * a usuarios no autenticados en Vercel. Para el flujo de activación por WhatsApp,
 * el usuario final NO tiene cuenta de Vercel, así que Vercel les bloquea el acceso.
 *
 * SOLUCIÓN: Servir esta página directamente desde el backend (Render).
 * El link de WhatsApp apunta a Render, que no tiene ninguna protección.
 * La página vanilla JS llama al mismo backend para validar el token y activar la cuenta.
 * Al finalizar, redirige al login en Vercel.
 */
@Controller()
export class ActivacionController {

  private readonly FRONTEND_URL = process.env.FRONTEND_URL || 'https://recorrido-lac.vercel.app';
  private readonly API_BASE = process.env.BACKEND_URL || 'https://recorrido-backend-u2dd.onrender.com';

  @Public()
  @Get('activar-cuenta')
  servirPaginaActivacion(@Query('token') token: string, @Res() res: Response) {
    const html = this.buildHtml(token || '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(html);
  }

  private buildHtml(token: string): string {
    const apiBase = this.API_BASE;
    const frontendUrl = this.FRONTEND_URL;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crear Contraseña — Recorrido Escolar</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f0f4ff 0%, #e8f5e9 100%);
      padding: 1rem;
    }

    .card {
      background: #fff;
      border-radius: 1rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      width: 100%;
      max-width: 420px;
      padding: 2.5rem 2rem;
      border-top: 4px solid #2563eb;
    }

    .icon-wrap {
      width: 56px; height: 56px;
      background: #eff6ff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 1.25rem;
    }

    h1 { font-size: 1.5rem; font-weight: 700; text-align: center; color: #1e293b; margin-bottom: .25rem; }
    .subtitle { text-align: center; color: #64748b; font-size: .875rem; margin-bottom: 1.5rem; line-height: 1.5; }

    .user-info {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: .5rem;
      padding: .75rem 1rem;
      display: flex; align-items: center; gap: .625rem;
      margin-bottom: 1.5rem;
    }
    .user-info .label { font-size: .75rem; color: #64748b; }
    .user-info .username { font-family: monospace; font-size: 1rem; font-weight: 700; color: #2563eb; }

    label { display: block; font-size: .875rem; font-weight: 500; color: #374151; margin-bottom: .35rem; }
    .field { margin-bottom: 1rem; }
    .input-wrap { position: relative; }

    input[type="password"], input[type="text"] {
      width: 100%; height: 2.75rem;
      border: 1.5px solid #d1d5db;
      border-radius: .5rem;
      padding: 0 2.75rem 0 .875rem;
      font-size: .9375rem;
      transition: border-color .15s;
      outline: none;
    }
    input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.15); }

    .eye-btn {
      position: absolute; right: .75rem; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; color: #94a3b8; padding: 0; line-height: 0;
    }
    .eye-btn:focus { outline: none; }

    .btn {
      width: 100%; height: 2.75rem;
      background: #2563eb; color: #fff;
      border: none; border-radius: .5rem;
      font-size: .9375rem; font-weight: 600;
      cursor: pointer; margin-top: .5rem;
      transition: background .15s, opacity .15s;
      display: flex; align-items: center; justify-content: center; gap: .5rem;
    }
    .btn:hover:not(:disabled) { background: #1d4ed8; }
    .btn:disabled { opacity: .6; cursor: not-allowed; }

    .alert {
      padding: .75rem 1rem;
      border-radius: .5rem;
      font-size: .875rem;
      margin-bottom: 1rem;
      display: flex; align-items: flex-start; gap: .5rem;
    }
    .alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }
    .alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; }

    /* Pantalla de carga */
    #view-loading { text-align: center; }
    #view-loading .spinner {
      width: 48px; height: 48px;
      border: 4px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin .7s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Pantallas éxito/error */
    #view-success .big-icon, #view-error .big-icon {
      width: 72px; height: 72px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 1.25rem;
    }
    #view-success .big-icon { background: #dcfce7; }
    #view-error   .big-icon { background: #fee2e2; }
    #view-success h1 { color: #15803d; }
    #view-error   h1 { color: #dc2626; }
    #view-success p, #view-error p { text-align: center; color: #64748b; margin: .5rem 0 1.25rem; font-size: .9rem; }

    .hidden { display: none; }
    svg { display: block; }
  </style>
</head>
<body>

<div class="card">

  <!-- ① CARGANDO -->
  <div id="view-loading">
    <div class="spinner"></div>
    <p style="color:#64748b;font-size:.9rem">Verificando enlace…</p>
  </div>

  <!-- ② FORMULARIO -->
  <div id="view-form" class="hidden">
    <div class="icon-wrap">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
    <h1>Crear Contraseña</h1>
    <p class="subtitle" id="welcome-msg">Establece tu contraseña para acceder al sistema.</p>

    <div class="user-info" id="user-info-wrap">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      <div>
        <div class="label">Tu usuario de acceso:</div>
        <div class="username" id="username-display">—</div>
      </div>
    </div>

    <div id="form-error" class="alert alert-error hidden"></div>

    <form id="activation-form">
      <div class="field">
        <label for="pass">Nueva Contraseña</label>
        <div class="input-wrap">
          <input id="pass" type="password" placeholder="Mínimo 6 caracteres" autocomplete="new-password" required />
          <button type="button" class="eye-btn" onclick="togglePass('pass', this)">
            <svg id="eye-pass" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label for="confirm">Confirmar Contraseña</label>
        <div class="input-wrap">
          <input id="confirm" type="password" placeholder="Repite tu contraseña" autocomplete="new-password" required />
        </div>
      </div>
      <button type="submit" class="btn" id="submit-btn">Guardar y Acceder al Sistema</button>
    </form>
  </div>

  <!-- ③ ÉXITO -->
  <div id="view-success" class="hidden">
    <div class="big-icon">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    </div>
    <h1>¡Cuenta Activada!</h1>
    <p>Tu contraseña fue guardada correctamente.<br>Redirigiendo al inicio de sesión…</p>
  </div>

  <!-- ④ ERROR -->
  <div id="view-error" class="hidden">
    <div class="big-icon">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <h1>Enlace no válido</h1>
    <p id="error-msg">Este enlace ya fue utilizado o ha caducado.<br>Solicita uno nuevo a tu administrador.</p>
    <button class="btn" onclick="window.location.href='${frontendUrl}/login'">Ir al inicio de sesión</button>
  </div>

</div>

<script>
  const TOKEN = ${JSON.stringify(token)};
  const API   = ${JSON.stringify(apiBase)};
  const LOGIN = ${JSON.stringify(frontendUrl + '/login')};

  // ── Helpers ──────────────────────────────────────────────────────────────
  function show(id) {
    ['view-loading','view-form','view-success','view-error'].forEach(v => {
      document.getElementById(v).classList.toggle('hidden', v !== id);
    });
  }

  function togglePass(inputId, btn) {
    const inp = document.getElementById(inputId);
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  function setFormError(msg) {
    const el = document.getElementById('form-error');
    if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
    else      { el.classList.add('hidden'); }
  }

  // ── 1. Validar token al cargar ────────────────────────────────────────────
  async function init() {
    if (!TOKEN) { show('view-error'); return; }

    try {
      const res  = await fetch(API + '/users/token-info/' + TOKEN);
      const data = await res.json();

      if (!data || !data.valido) { show('view-error'); return; }

      // Personalizar UI con datos del usuario
      document.getElementById('welcome-msg').textContent =
        'Hola ' + (data.nombre || '') + ', establece tu contraseña para acceder al sistema.';
      document.getElementById('username-display').textContent = data.username || '—';

      show('view-form');
    } catch(e) {
      document.getElementById('error-msg').textContent =
        'No se pudo verificar el enlace. Revisa tu conexión e intenta de nuevo.';
      show('view-error');
    }
  }

  // ── 2. Enviar formulario ──────────────────────────────────────────────────
  document.getElementById('activation-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    setFormError('');

    const pass    = document.getElementById('pass').value;
    const confirm = document.getElementById('confirm').value;

    if (pass.length < 6) { setFormError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (pass !== confirm) { setFormError('Las contraseñas no coinciden.'); return; }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      const res  = await fetch(API + '/users/activar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, password: pass }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Error desconocido');
        setFormError(msg);
        btn.disabled = false;
        btn.textContent = 'Guardar y Acceder al Sistema';
        return;
      }

      show('view-success');
      setTimeout(() => { window.location.href = LOGIN; }, 2500);
    } catch(err) {
      setFormError('Error de red. Por favor intenta de nuevo.');
      btn.disabled = false;
      btn.textContent = 'Guardar y Acceder al Sistema';
    }
  });

  // Arrancar
  init();
</script>
</body>
</html>`;
  }
}
