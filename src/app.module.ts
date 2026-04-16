import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
// 👇 IMPORTAR MÓDULO DE PROTECCIÓN (RATE LIMIT)
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Módulos Funcionales
import { AlumnosModule } from './alumnos/alumnos.module';
import { AsistenciaModule } from './asistencias/asistencia.module';
import { UsersModule } from './users/users.module';
import { PagosModule } from './pagos/pagos.module';
import { GastosModule } from './gastos/gastos.module';
import { PersonalModule } from './personal/personal.module';
import { VehiculosModule } from './vehiculos/vehiculos.module';
import { AvisosModule } from './avisos/avisos.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { DiasNoLectivosModule } from './dias-no-lectivos/dias-no-lectivos.module';
import { TutorModule } from './tutor/tutor.module';
import { ReportesModule } from './reportes/reportes.module';
import { SolicitudesModule } from './solicitudes/solicitudes.module';

import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { EventsModule } from './events/events.module';
import { ActivacionModule } from './activacion/activacion.module';

import { SupabaseModule } from './supabase/supabase.module';
import { AuthGuard } from './supabase/auth.guard'; 

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    
    // 🛡️ 1. CONFIGURACIÓN DE RATE LIMITING (ANTISPAM)
    ThrottlerModule.forRoot([{
      ttl: 60000, // Tiempo de vida: 60 segundos (1 minuto)
      limit: 20,  // Límite: Máximo 20 peticiones por IP en ese minuto
    }]),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: true,
        ssl: { rejectUnauthorized: false }, 
      }),
    }),
    
    SupabaseModule,
    UsersModule,
    AlumnosModule,
    AsistenciaModule,
    PagosModule,
    GastosModule,
    PersonalModule,
    VehiculosModule,
    AvisosModule,
    ConfiguracionModule,
    DiasNoLectivosModule,
    TutorModule,
    ReportesModule,
    SolicitudesModule,
    NotificacionesModule,
    EventsModule,
    ActivacionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 🛡️ 2. ACTIVAR EL ESCUDO GLOBALMENTE
    // El orden importa: Primero revisamos si es spam (Throttler), luego si tiene token (Auth)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}