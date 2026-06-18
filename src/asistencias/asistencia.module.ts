import { Module } from '@nestjs/common';
import { AsistenciaService } from './asistencia.service';
import { AsistenciaController } from './asistencia.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asistencia } from './asistencia.entity';
import { Alumno } from '../alumnos/alumno.entity';
import { User } from '../users/user.entity';
import { Vehiculo } from '../vehiculos/vehiculo.entity';
import { Aviso } from '../avisos/aviso.entity';
import { Personal } from '../personal/personal.entity';

import { UsersModule } from '../users/users.module';
import { AlumnosModule } from '../alumnos/alumnos.module';
import { VehiculosModule } from '../vehiculos/vehiculos.module';
import { AvisosModule } from '../avisos/avisos.module';
import { ConfiguracionModule } from '../configuracion/configuracion.module';
import { DiasNoLectivosModule } from '../dias-no-lectivos/dias-no-lectivos.module';

@Module({
  imports: [
    // Registramos las entidades que usaremos
    TypeOrmModule.forFeature([
      Asistencia,
      Alumno,
      User,
      Vehiculo,
      Aviso,
      Personal,  // fallback: el vehículo del asistente puede estar en la nómina (personal)
    ]),

    UsersModule,
    AlumnosModule,
    VehiculosModule,
    AvisosModule,
    ConfiguracionModule,
    DiasNoLectivosModule,
  ],
  controllers: [AsistenciaController],
  providers: [AsistenciaService],
})
export class AsistenciaModule {}