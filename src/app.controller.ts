import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';

@Controller()
export class AppController {
  
  @Public() 
  @Get()
  getHello(): string {
    return 'El servidor del Recorrido Escolar está funcionando correctamente 🚀';
  }

  // Endpoint para verificar versión del deploy y mantener el servidor activo
  @Public()
  @Get('ping')
  ping() {
    return {
      status: 'ok',
      // ← Cambiar este número confirma que el nuevo código está desplegado
      version: '2.0.0-temp-password-flow',
      timestamp: new Date().toISOString(),
    };
  }
}