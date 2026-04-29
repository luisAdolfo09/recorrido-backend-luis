import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Personal } from './personal.entity';
import { CreatePersonalDto } from './dto/create-personal.dto';
import { UpdatePersonalDto } from './dto/update-personal.dto';
import { UsersService } from '../users/users.service'; 

@Injectable()
export class PersonalService {
  constructor(
    @InjectRepository(Personal)
    private personalRepository: Repository<Personal>,
    private usersService: UsersService, 
  ) {}

  // --- LEER TODOS ---
  findAll(): Promise<Personal[]> {
    return this.personalRepository.find({
      where: { estado: Not('eliminado') },
      order: { nombre: 'ASC' }
    });
  }

  // --- LEER POR ESTADO ---
  findAllByEstado(estado: string): Promise<Personal[]> {
     return this.personalRepository.find({
      where: { estado: estado },
      order: { nombre: 'ASC' }
    });
  }

  // --- LEER UNO ---
  async findOne(id: string): Promise<Personal> {
    const personal = await this.personalRepository.findOneBy({ id });
    if (!personal || personal.estado === 'eliminado') {
      throw new NotFoundException(`Personal no encontrado`);
    }
    return personal;
  }

  // --- CREAR (Con Usuario Automático) ---
  async create(createPersonalDto: CreatePersonalDto): Promise<Personal> {
    const datos = createPersonalDto as any;

    // 1. Validaciones previas
    if (!datos.telefono) throw new BadRequestException("El teléfono es obligatorio.");

    // 2. Verificar duplicado en nómina (Usando 'contacto' que es el nombre real en la entidad)
    const existePersonal = await this.personalRepository.findOne({ where: { contacto: datos.telefono } });
    if (existePersonal) throw new BadRequestException("Ya existe un empleado registrado con este teléfono.");

    // 3. Validación de Vehículo Ocupado
    if (datos.vehiculoId && datos.vehiculoId !== 'N/A') {
        const puesto = datos.puesto; 
        const ocupanteExistente = await this.personalRepository.findOne({
            where: { 
                vehiculoId: datos.vehiculoId, 
                puesto: puesto,
                estado: 'activo' 
            }
        });

        if (ocupanteExistente) {
            throw new BadRequestException(`El vehículo ya tiene un ${puesto} asignado: ${ocupanteExistente.nombre}`);
        }
    }

    // 4. Crear Usuario de Sistema (Login)
    // Inicializamos como undefined para satisfacer el tipado estricto de TypeORM
    let userId: string | undefined; 

    try {
        console.log(`👤 Creando usuario de sistema para personal: ${datos.nombre}`);
        
        const rolAsignado = datos.puesto.toLowerCase() === 'chofer' ? 'chofer' : 'asistente';

        // Llamamos al servicio de usuarios pasando también el vehículo
        const nuevoUsuario = await this.usersService.create({
            nombre: datos.nombre,
            telefono: datos.telefono,
            rol: rolAsignado, 
            vehiculoId: (datos.vehiculoId && datos.vehiculoId !== 'N/A') ? datos.vehiculoId : undefined
        });
        
        userId = nuevoUsuario.id;

    } catch (error: any) {
        console.error("Error creando usuario para personal:", error.message);
        // Si el error no es "teléfono duplicado" (400), alertamos
        if (error.status !== 400) { 
             throw new BadRequestException("No se pudo crear el usuario de acceso. Verifica el teléfono.");
        }
        // Si es duplicado, seguimos (userId quedará undefined, pero el empleado se crea)
    }
    
    // 5. Crear Registro de Personal
    const newPersonal = this.personalRepository.create({
      ...createPersonalDto,
      contacto: datos.telefono, 
      userId: userId, // Ahora es string | undefined, lo cual es válido
      estado: 'activo',
    });

    return await this.personalRepository.save(newPersonal);
  }

  // --- ACTUALIZAR ---
  async update(id: string, updatePersonalDto: UpdatePersonalDto): Promise<Personal> {
    const personalExistente = await this.personalRepository.findOne({ 
      where: { id: id },
      relations: ['vehiculo'] 
    });

    if (!personalExistente || personalExistente.estado === 'eliminado') {
      throw new NotFoundException(`Personal no encontrado`);
    }

    // Mapear telefono a contacto para la entidad Personal
    const datosActualizar: any = { ...updatePersonalDto };
    if (datosActualizar.telefono) {
      datosActualizar.contacto = datosActualizar.telefono;
      delete datosActualizar.telefono;
    }

    const personalActualizado = await this.personalRepository.preload({
      ...personalExistente,
      ...datosActualizar,  
    });
    
    if (!personalActualizado) throw new NotFoundException(`Error al actualizar`);

    const savedPersonal = await this.personalRepository.save(personalActualizado);

    // Sincronizar cambios con el Usuario asociado (si tiene)
    if (savedPersonal.userId && updatePersonalDto.estado !== 'eliminado') {
      const userUpdates: any = {};
      if (updatePersonalDto.nombre) userUpdates.nombre = updatePersonalDto.nombre;
      if (updatePersonalDto.telefono) userUpdates.telefono = updatePersonalDto.telefono;
      if (updatePersonalDto.puesto) userUpdates.rol = updatePersonalDto.puesto.toLowerCase() === 'chofer' ? 'chofer' : 'asistente';
      if (updatePersonalDto.estado) userUpdates.estatus = updatePersonalDto.estado === 'activo' ? 'activo' : 'inactivo';

      if (Object.keys(userUpdates).length > 0) {
        try {
          await this.usersService.update(savedPersonal.userId, userUpdates);
        } catch (e: any) {
          console.error("Warning: No se pudo sincronizar el usuario asociado:", e.message);
          // Opcional: si el teléfono está en uso por otro usuario, podríamos lanzar un BadRequestException
          if (e.status === 400) {
             throw new BadRequestException("El teléfono ya está en uso por otro usuario. No se guardaron los cambios.");
          }
        }
      }
    }

    return savedPersonal;
  }

  // --- ELIMINAR ---
  async remove(id: string): Promise<void> {
    const personal = await this.personalRepository.findOne({ where: { id } });
    if (!personal) throw new NotFoundException('Personal no encontrado');
    
    // Borrado lógico en Personal
    personal.estado = 'eliminado';
    await this.personalRepository.save(personal);

    // Sincronizar: Borrado lógico en el Usuario asociado
    if (personal.userId) {
      try {
        await this.usersService.update(personal.userId, { estatus: 'inactivo' as any });
      } catch (e) {
        console.error("Warning: No se pudo desactivar el usuario asociado");
      }
    }
  }
}