import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from './user.entity';
import { SupabaseService } from '../supabase/supabase.service'; 
import * as crypto from 'crypto'; 

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private supabaseService: SupabaseService, 
  ) {}

  findAll() {
    return this.usersRepository.find({ order: { nombre: 'ASC' } });
  }

  findOne(id: string) {
    return this.usersRepository.findOneBy({ id });
  }

  // --- ACTUALIZAR USUARIO (Para editar Tutor/Personal) ---
  async update(id: string, changes: Partial<User>) {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException("Usuario no encontrado");

    // Si cambia el teléfono, verificamos que no esté repetido en otro usuario
    if (changes.telefono && changes.telefono !== user.telefono) {
        const existe = await this.usersRepository.findOneBy({ telefono: changes.telefono });
        if (existe) throw new BadRequestException("Ese teléfono ya está en uso por otro usuario.");
    }

    this.usersRepository.merge(user, changes);
    return await this.usersRepository.save(user);
  }

  // --- LOOKUP (Paso 1 del Login) ---
  async lookupUser(identifier: string) {
    const user = await this.usersRepository.findOne({
        where: [
            { username: identifier },
            { telefono: identifier }
        ]
    });

    if (!user) throw new NotFoundException("Usuario no encontrado");
    
    return { 
        email: user.email, 
        rol: user.rol 
    };
  }

  // --- CREAR USUARIO (Soporta creación desde Alumnos y Personal) ---
  async create(datos: Partial<User>) {
    try {
      const telefonoLimpio = datos.telefono?.trim();
      if (!telefonoLimpio) throw new BadRequestException("El teléfono es obligatorio.");

      // Verificamos si ya existe (aunque PersonalService ya lo valida, es doble seguridad)
      const existe = await this.usersRepository.findOneBy({ telefono: telefonoLimpio });
      if (existe) {
          // Si ya existe, retornamos el existente para no fallar
          return existe; 
      }

      let usernameFinal = datos.username;
      if (!usernameFinal && datos.nombre) {
        // Generar username base: juan.perez + 4 digitos
        const base = datos.nombre.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
        const random = Math.floor(1000 + Math.random() * 9000);
        usernameFinal = `${base}${random}`;
      }

      const emailFantasma = `${usernameFinal}@recorrido.app`; 
      const passwordTemporal = `Temp${Math.random().toString(36).slice(-8)}`; 
      let authUserId: string = crypto.randomUUID(); 
      
      // 1. Crear en Supabase Auth
      try {
          const { data: authUser } = await this.supabaseService.admin.createUser({
            email: emailFantasma,
            password: passwordTemporal,
            email_confirm: true,
            user_metadata: { nombre: datos.nombre, rol: datos.rol }
          });
          if (authUser?.user) authUserId = authUser.user.id;
      } catch (e: any) { 
          console.error("Supabase create warning:", e.message); 
      }

      // 2. Guardar en Base de Datos Local
      const nuevoUsuario = this.usersRepository.create({
        ...datos, // Aquí entra vehiculoId si viene del PersonalService
        id: authUserId, 
        username: usernameFinal,
        telefono: telefonoLimpio,
        email: emailFantasma, 
        rol: datos.rol || 'tutor',
        estatus: UserStatus.INVITADO, 
        contrasena: undefined, 
        intentosFallidos: 0, // Inicializamos contador
      });

      return await this.usersRepository.save(nuevoUsuario);

    } catch (error) {
      console.error("Error creando usuario:", error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("Error al crear usuario.");
    }
  }

  // --- SOLICITAR RESET DE CONTRASEÑA (Para el usuario final) ---
  async solicitarResetPassword(identifier: string) {
    const user = await this.usersRepository.findOne({
        where: [
            { username: identifier },
            { telefono: identifier }
        ]
    });

    if (!user) {
        // Retornamos un mensaje de éxito falso por seguridad (evita enumeración de usuarios)
        return { message: "Si los datos coinciden con un usuario, tu administrador podrá enviarte un nuevo enlace a través de WhatsApp." };
    }

    // Generamos el token y lo guardamos
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    user.invitationToken = token;
    await this.usersRepository.save(user);

    return { message: "Si los datos coinciden con un usuario, tu administrador podrá enviarte un nuevo enlace a través de WhatsApp." };
  }

  // --- VALIDAR TOKEN (Solo para mostrar info en frontend, sin activar) ---
  async validarToken(token: string) {
    const user = await this.usersRepository.createQueryBuilder("user")
      .where("user.invitationToken = :token", { token })
      .addSelect("user.invitationToken")
      .getOne();

    if (!user) return { valido: false };
    return { valido: true, nombre: user.nombre, username: user.username };
  }

  // --- GENERAR INVITACIÓN (Link de WhatsApp) ---
  async generarTokenInvitacion(id: string) {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    user.invitationToken = token;
    
    // Asegurar username si falta
    if (!user.username) {
       const nombreBase = user.nombre ? user.nombre : 'usuario';
       const base = nombreBase.trim().toLowerCase().replace(/\s+/g, '.');
       user.username = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    }

    await this.usersRepository.save(user);

    // ✅ El link apunta al BACKEND (Render), NO a Vercel.
    // Render no tiene "Deployment Protection" — el usuario siempre puede abrirlo.
    let backendUrl = process.env.BACKEND_URL || 'https://recorrido-backend-u2dd.onrender.com';
    if (backendUrl.endsWith('/')) backendUrl = backendUrl.slice(0, -1);
    
    const linkActivacion = `${backendUrl}/activar-cuenta?token=${token}`;
    
    const mensaje = `Hola ${user.nombre}, bienvenido al sistema Recorrido Escolar 🚌\n\n👤 Tu usuario: *${user.username}*\n\n🔐 Haz clic en este enlace para crear tu contraseña:\n${linkActivacion}\n\n_Este enlace es de un solo uso._`;

    return { link: linkActivacion, telefono: user.telefono, mensaje };
  }

  // --- ACTIVAR CUENTA (Establecer Password) ---
  async activarCuenta(token: string, contrasena: string) {
    const user = await this.usersRepository.findOneBy({ invitationToken: token });
    if (!user) throw new NotFoundException("Link inválido o expirado.");

    try {
        await this.supabaseService.admin.updateUserById(user.id, { password: contrasena });
    } catch(e) { console.error("Error al sincronizar password con Supabase"); }

    user.estatus = UserStatus.ACTIVO;
    user.invitationToken = null as any; 

    return await this.usersRepository.save(user);
  }

  // --- LOGIN BLINDADO (PROTECCIÓN FUERZA BRUTA) ---
  async login(username: string, contrasena: string) {
    if (!username) throw new BadRequestException("Username es obligatorio");

    const query = this.usersRepository.createQueryBuilder("user")
      .where("user.username = :username", { username })
      .addSelect("user.contrasena");

    const user = await query.getOne();

    // 1. Validaciones básicas
    if (!user) throw new UnauthorizedException("Credenciales inválidas.");
    
    // 2. 🔒 VERIFICAR SI ESTÁ BLOQUEADO
    if (user.bloqueadoHasta && new Date() < user.bloqueadoHasta) {
        const tiempoRestante = Math.ceil((user.bloqueadoHasta.getTime() - new Date().getTime()) / 60000);
        throw new ForbiddenException(`Cuenta bloqueada temporalmente por seguridad. Intenta de nuevo en ${tiempoRestante} minutos.`);
    }

    if (user.estatus !== UserStatus.ACTIVO) throw new UnauthorizedException("Cuenta no activada.");

    // 3. Intentar Login
    const { data, error } = await this.supabaseService.client.auth.signInWithPassword({
        email: user.email, 
        password: contrasena
    });

    if (error) {
        // 🛑 FALLO DE CONTRASEÑA: CASTIGO
        user.intentosFallidos = (user.intentosFallidos || 0) + 1;
        
        // Si llega a 5 intentos, BLOQUEAR 15 MINUTOS
        if (user.intentosFallidos >= 5) {
            const bloqueo = new Date();
            bloqueo.setMinutes(bloqueo.getMinutes() + 15); 
            user.bloqueadoHasta = bloqueo;
            console.warn(`🚨 Usuario ${username} BLOQUEADO hasta ${bloqueo}`);
        }
        
        await this.usersRepository.save(user); // Guardamos el fallo
        
        console.error(`Login fallido para: ${username}. Intentos: ${user.intentosFallidos}`);
        throw new UnauthorizedException("Contraseña incorrecta.");
    }

    // ✅ ÉXITO: PERDÓN (Resetear contadores)
    if (user.intentosFallidos > 0 || user.bloqueadoHasta) {
        user.intentosFallidos = 0;
        // 👇 CORRECCIÓN: Usamos 'as any' para permitir asignar null, ya que en la entidad está definido como Date
        user.bloqueadoHasta = null as any; 
        await this.usersRepository.save(user);
    }

    const { contrasena: pass, invitationToken, ...result } = user;

    return { 
        ...result, 
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token 
    };
  }

  async createAdminSeed() {
    return { message: "Función deshabilitada por seguridad en producción" };
  }
}