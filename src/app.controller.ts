import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './common/public.decorator';

@Controller()
export class AppController {
  
  @Public() 
  @Get()
  getHello(): string {
    return 'El servidor del Recorrido Escolar está funcionando correctamente 🚀';
  }

  // Verificar versión del deploy activo
  @Public()
  @Get('ping')
  ping() {
    return {
      status: 'ok',
      version: '2.1.0-stable-redirect',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Redirección estable al login del frontend.
   * 
   * El link de WhatsApp apunta SIEMPRE a esta URL del backend:
   *   https://recorrido-backend-u2dd.onrender.com/entrar
   * 
   * Desde aquí se hace un 302 redirect al FRONTEND_URL correcto.
   * Ventajas:
   *  - La URL del backend nunca cambia (no hay deployments continuos del backend)
   *  - Para cambiar el destino, solo se actualiza FRONTEND_URL en Render (sin nuevo deploy)
   *  - Bypasea completamente el problema de Vercel Deployment Protection
   *  - El redirect 302 es casi instantáneo incluso en cold start
   */
  @Public()
  @Get('entrar')
  redirigirAlLogin(@Res() res: Response) {
    const frontendUrl = (
      process.env.FRONTEND_URL || 
      'https://recorrido-frontend-luis-2clo7xk3f-luis-projects-ed17d2e5.vercel.app'
    ).replace(/\/$/, '');
    
    res.redirect(302, `${frontendUrl}/login`);
  }
}
