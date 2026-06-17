import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { PersonalService } from './personal.service';
import { CreatePersonalDto } from './dto/create-personal.dto';
import { UpdatePersonalDto } from './dto/update-personal.dto';
import { Roles } from '../common/roles.decorator';

@Roles('propietario')
@Controller('personal')
export class PersonalController {
  constructor(private readonly personalService: PersonalService) {}

  // 1. REGISTRAR PERSONAL (POST /personal)
  @Post()
  create(@Body() createPersonalDto: CreatePersonalDto) {
    return this.personalService.create(createPersonalDto);
  }

  // 2. LISTAR PERSONAL (GET /personal?estado=activo)
  @Get()
  findAll(@Query('estado') estado?: string) {
    if (estado && estado !== 'todos') {
      return this.personalService.findAllByEstado(estado);
    }
    return this.personalService.findAll();
  }

  // 3. OBTENER UNO (GET /personal/:id)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.personalService.findOne(id);
  }

  // 4. ACTUALIZAR (PATCH /personal/:id)
  // Se usa también para desactivar (estado: 'inactivo')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePersonalDto: UpdatePersonalDto) {
    return this.personalService.update(id, updatePersonalDto);
  }

  // 5. ELIMINAR (DELETE /personal/:id)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.personalService.remove(id);
  }
}