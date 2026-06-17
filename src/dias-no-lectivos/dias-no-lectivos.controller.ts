import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Delete, 
  Param, 
  UseGuards, 
  ParseUUIDPipe
} from '@nestjs/common';
import { DiasNoLectivosService } from './dias-no-lectivos.service';
import { CreateDiaNoLectivoDto } from './dto/create-dia-no-lectivo.dto';
import { AuthGuard } from '@nestjs/passport'; // O tu Guard de JWT
import { Roles } from '../common/roles.decorator';

@Roles('propietario')
@Controller('dias-no-lectivos')
//@UseGuards(AuthGuard('jwt')) // Proteger todas las rutas
export class DiasNoLectivosController {
  constructor(private readonly diasNoLectivosService: DiasNoLectivosService) {}

  @Post()
  // @Roles('propietario') // <-- Opcional: Proteger solo para propietario
  create(@Body() createDiaNoLectivoDto: CreateDiaNoLectivoDto) {
    return this.diasNoLectivosService.create(createDiaNoLectivoDto);
  }

  @Get()
  // @Roles('propietario') // <-- Opcional: Proteger solo para propietario
  findAll() {
    return this.diasNoLectivosService.findAll();
  }

  @Delete(':id')
  // @Roles('propietario') // <-- Opcional: Proteger solo para propietario
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.diasNoLectivosService.remove(id);
  }
}