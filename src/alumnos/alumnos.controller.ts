import { Controller, Get, Post, Body, Patch, Param, Delete, Request, Query, UnauthorizedException } from '@nestjs/common';
import { AlumnosService } from './alumnos.service';
import { AuthGuard } from '../supabase/auth.guard';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';

@Controller('alumnos')
// Nota: Usamos la protección AuthGuard global en app.module.ts
export class AlumnosController {
  constructor(private readonly alumnosService: AlumnosService) {}

  @Roles('propietario')
  @Post()
  create(@Body() createAlumnoDto: any, @Request() req: any) {
    return this.alumnosService.create(createAlumnoDto, req.user.id);
  }

  @Get()
  findAll(@Request() req: any, @Query('estado') estado?: string) {
    const user = req.user;
    const rol = user.user_metadata?.rol?.toLowerCase();
    
    // MODO OPERATIVO: Propietario, Admin y Asistente ven TODOS los alumnos
    if (rol === 'propietario' || rol === 'admin' || rol === 'asistente') {
        return this.alumnosService.findAll(estado);
    }

    // MODO TUTOR: Solo ve a sus hijos
    return this.alumnosService.findByTutor(user.id, estado);
  }
  
  // --- RUTA DE MANTENIMIENTO ANUAL (Promoción) ---
  @Patch('promover')
  async promover(@Request() req: any) {
      // 🛡️ VALIDACIÓN CRÍTICA: Solo el Propietario/Admin puede ejecutar la promoción
      const rol = req.user.user_metadata?.rol?.toLowerCase();
      if (rol !== 'propietario' && rol !== 'admin') {
          throw new UnauthorizedException('Acceso denegado. Se requiere rol de Propietario o Administrador para esta función.');
      }
      return this.alumnosService.promoverAlumnos();
  }
  // ------------------------------------------------

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alumnosService.findOne(id);
  }

  @Roles('propietario')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAlumnoDto: any) {
    return this.alumnosService.update(id, updateAlumnoDto);
  }

  @Roles('propietario')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.alumnosService.remove(id);
  }
}