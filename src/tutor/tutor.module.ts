import { Module } from '@nestjs/common';
import { TutorService } from './tutor.service';
import { TutorController } from './tutor.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Alumno } from '../alumnos/alumno.entity';
import { Asistencia } from '../asistencias/asistencia.entity';
import { Aviso } from '../avisos/aviso.entity';
import { Pago } from '../pagos/pago.entity'; // 👈 Faltaba importar la entidad Pago
// Importa los módulos si es necesario, o usa forFeature si las entidades están disponibles
import { UsersModule } from '../users/users.module';
import { AlumnosModule } from '../alumnos/alumnos.module';
import { AvisosModule } from '../avisos/avisos.module';
import { PagosModule } from '../pagos/pagos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Alumno, Asistencia, Aviso, Pago]),
    UsersModule,
    AlumnosModule,
    AvisosModule,
    PagosModule
    // Importa AsistenciaModule si exporta TypeOrmModule, si no, forFeature está bien aquí
  ],
  controllers: [TutorController],
  providers: [TutorService],
})
export class TutorModule {}