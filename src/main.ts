import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express'; // 👈 IMPORTANTE

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // 👇 CAMBIO: Tipamos la app como NestExpressApplication para acceder a "set"
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 🛡️ ACTIVAR TRUST PROXY (CRÍTICO PARA RENDER)
  // Esto permite que el Rate Limit lea la IP real del usuario y no la del balanceador de carga.
  app.set('trust proxy', 1);

  // 🛡️ 1. HABILITAR CORS DE FORMA SEGURA
  const allowedOrigins = [
    'http://localhost:3000', 
    'http://localhost:3001',
    process.env.FRONTEND_URL, 
    'https://recorrido-lac.vercel.app',
    'https://recorrido-frontend-luis-2clo7xk3f-luis-projects-ed17d2e5.vercel.app',
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) return callback(null, true);
      
      if (origin.endsWith('.vercel.app')) {
         return callback(null, true);
      }

      logger.warn(`🔒 Bloqueada petición CORS sospechosa desde: ${origin}`);
      callback(null, false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Authorization, x-user-id', 
  });

  // 2. Validaciones globales
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`\n\n🛡️ SERVIDOR SEGURO INICIADO EN PUERTO: ${port}`);
  logger.log(`🛡️ CORS HABILITADO CON TRUST PROXY ACTIVO\n`);
}
bootstrap();