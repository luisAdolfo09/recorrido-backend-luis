import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AvisosService } from './avisos.service';
import { CreateAvisoDto } from './dto/create-aviso.dto';
import { UpdateAvisoDto } from './dto/update-aviso.dto';
import { Roles } from '../common/roles.decorator';

// La autenticación la aplica el AuthGuard GLOBAL (APP_GUARD en app.module.ts).
// No usamos @UseGuards(AuthGuard) aquí: re-instanciaría el guard en el contexto de
// este módulo, que no provee UserRepository, y rompería el arranque de Nest.
@Controller('avisos')
export class AvisosController {
  constructor(private readonly avisosService: AvisosService) {}

  @Roles('propietario')
  @Post()
  create(@Body() createAvisoDto: CreateAvisoDto) {
    return this.avisosService.create(createAvisoDto);
  }

  @Roles('propietario')
  @Get()
  findAll() {
    return this.avisosService.findAll();
  }

  // 🚨 RUTAS ESTÁTICAS PRIMERO (Antes de :id)
  @Get('para-tutor')
  findAllParaTutor() {
    return this.avisosService.findAllParaTutor();
  }

  @Get('para-asistente')
  findAllParaAsistente() {
    return this.avisosService.findAllParaAsistente();
  }

  // 🚨 RUTAS DINÁMICAS AL FINAL
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.avisosService.findOne(id);
  }

  @Roles('propietario')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAvisoDto: UpdateAvisoDto) {
    return this.avisosService.update(id, updateAvisoDto);
  }

  @Roles('propietario')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.avisosService.remove(id);
  }
}