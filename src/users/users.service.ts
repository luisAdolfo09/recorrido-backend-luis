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

  // --- ACTUALIZAR USUARIO ---
  async update(id: string, changes: Partial<User>) {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException("Usuario no encontrado");

    if (changes.telefono && changes.telefono !== user.telefono) {
        const existe = await this.usersRepository.findOneBy({ telefono: changes.telefono });
        if (existe) throw new BadRequestException("Ese teléfono ya está en uso por otro usuario.");
    }

    this.usersRepository.merge(user, changes);
    return await this.usersRepository.save(user);
  }

  // --- LOOKUP (Paso 1 del Login) ---
  // ✅ Ahora también devuelve estatus para que el frontend sepa si redirigir a primer-acceso
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
        rol: user.rol,
        estatus: user.estatus,   // ← NUEVO: necesario para detectar primer acceso
    };
  }

  // --- CREAR USUARIO ---
  async create(datos: Partial<User>) {
    try {
      const telefonoLimpio = datos.telefono?.trim();
      if (!telefonoLimpio) throw new BadRequestException("El teléfono es obligatorio.");

      const existe = await this.usersRepository.findOneBy({ telefono: telefonoLimpio });
      if (existe) return existe;

      let usernameFinal = datos.username;
      if (!usernameFinal && datos.nombre) {
        const base = datos.nombre.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
        const random = Math.floor(1000 + Math.random() * 9000);
        usernameFinal = `${base}${random}`;
      }

      const emailFantasma = `${usernameFinal}@recorrido.app`;
      // La contraseña inicial no importa — se sobreescribirá en generarAccesoTemporal
      const passwordInicial = `Init${crypto.randomUUID().slice(0, 8)}`;
      let authUserId: string = crypto.randomUUID(); 
      
      try {
          const { data: authUser } = await this.supabaseService.admin.createUser({
            email: emailFantasma,
            password: passwordInicial,
            email_confirm: true,
            user_metadata: { nombre: datos.nombre, rol: datos.rol }
          });
          if (authUser?.user) authUserId = authUser.user.id;
      } catch (e: any) { 
          console.error("Supabase create warning:", e.message); 
      }

      const nuevoUsuario = this.usersRepository.create({
        ...datos,
        id: authUserId, 
        username: usernameFinal,
        telefono: telefonoLimpio,
        email: emailFantasma, 
        rol: datos.rol || 'tutor',
        estatus: UserStatus.INVITADO, 
        contrasena: undefined, 
        intentosFallidos: 0,
      });

      return await this.usersRepository.save(nuevoUsuario);

    } catch (error) {
      console.error("Error creando usuario:", error);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("Error al crear usuario.");
    }
  }

  // =========================================================
  // ✅ NUEVO FLUJO PROFESIONAL: CONTRASEÑA TEMPORAL
  // Sin links de activación. Sin dependencia de browsers.
  // Mismo patrón que usan bancos y sistemas empresariales.
  // =========================================================

  /**
   * Genera una contraseña temporal para el usuario y la configura en Supabase Auth.
   * El admin la envía por WhatsApp junto con el username.
   * Al entrar con ella, el sistema detecta estatus INVITADO → redirige a /primer-acceso.
   */
  async generarAccesoTemporal(id: string) {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // Asegurar username
    if (!user.username) {
       const base = (user.nombre || 'usuario').trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
       user.username = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Contraseña temporal: formato fácil de dictar por teléfono o leer en WhatsApp
    // Ej: "Casa5812" — fácil de tipear en móvil
    const palabras = ['Acceso', 'Clave', 'Entra', 'Casa', 'Ruta', 'Bus'];
    const palabra = palabras[Math.floor(Math.random() * palabras.length)];
    const digitos = Math.floor(1000 + Math.random() * 9000);
    const contrasenaTemp = `${palabra}${digitos}`;

    // Actualizar contraseña en Supabase Auth
    try {
      const { error } = await this.supabaseService.admin.updateUserById(user.id, {
        password: contrasenaTemp,
      });
      if (error) {
        // Si el usuario no existe en Auth, intentar crearlo
        console.warn(`User ${user.id} not in Supabase Auth, trying to create...`);
        await this.supabaseService.admin.createUser({
          email: user.email,
          password: contrasenaTemp,
          email_confirm: true,
          user_metadata: { nombre: user.nombre, rol: user.rol }
        });
      }
    } catch (e: any) {
      console.error('Error configurando Supabase Auth:', e.message);
      throw new BadRequestException('No se pudo configurar el acceso. Verifica la conexión con Supabase.');
    }

    // Marcar como INVITADO (así login detecta primer acceso y redirige a /primer-acceso)
    user.estatus = UserStatus.INVITADO;
    user.invitationToken = null as any; // Limpiar tokens anteriores
    await this.usersRepository.save(user);

    // Usamos el enlace solicitado (dominio actual de Vercel)
    const loginUrl = 'https://recorrido-frontend-luis-b3nyz16ly-luis-projects-ed17d2e5.vercel.app';

    const mensaje = 
      `Hola ${user.nombre}! 👋\n\n` +
      `Fuiste invitado al sistema *Recorrido Escolar* 🚌\n\n` +
      `Para acceder sigue estos pasos:\n\n` +
      `1️⃣ Abre este enlace: ${loginUrl}\n` +
      `2️⃣ Ingresa tu usuario y contraseña temporal:\n\n` +
      `   👤 *Usuario:* ${user.username}\n` +
      `   🔑 *Contraseña temporal:* ${contrasenaTemp}\n\n` +
      `_Al entrar por primera vez, el sistema te pedirá crear una contraseña personal._`;

    return {
      mensaje,
      telefono: user.telefono,
      username: user.username,
      contrasenaTemp,
    };
  }

  /**
   * El usuario ya entró con la contraseña temporal.
   * Ahora establece su contraseña definitiva → estatus pasa a ACTIVO.
   */
  async completarPrimerAcceso(userId: string, nuevaPassword: string) {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const { error } = await this.supabaseService.admin.updateUserById(userId, {
      password: nuevaPassword,
    });
    if (error) throw new BadRequestException('No se pudo actualizar la contraseña. Intenta de nuevo.');

    user.estatus = UserStatus.ACTIVO;
    user.intentosFallidos = 0;
    user.bloqueadoHasta = null as any;
    return await this.usersRepository.save(user);
  }

  // --- ACTIVAR CUENTA POR TOKEN (compatibilidad con links viejos) ---
  async activarCuenta(token: string, contrasena: string) {
    const user = await this.usersRepository.createQueryBuilder("user")
      .where("user.invitationToken = :token", { token })
      .addSelect("user.invitationToken")
      .getOne();
    if (!user) throw new NotFoundException("Link inválido o expirado.");

    try {
      await this.supabaseService.admin.updateUserById(user.id, { password: contrasena });
    } catch(e) { console.error("Error sincronizando password con Supabase"); }

    user.estatus = UserStatus.ACTIVO;
    user.invitationToken = null as any;
    return await this.usersRepository.save(user);
  }

  // --- SOLICITAR RESET (usuario final pide reset a través de la app) ---
  async solicitarResetPassword(identifier: string) {
    // Respuesta siempre igual por seguridad (evita enumeración)
    await this.usersRepository.findOne({
        where: [{ username: identifier }, { telefono: identifier }]
    }).then(user => {
      if (user) {
        // Simplemente marcamos como INVITADO para que el admin regenere acceso
        user.estatus = UserStatus.INVITADO;
        this.usersRepository.save(user);
      }
    }).catch(() => {});

    return { message: "Si los datos coinciden, tu administrador podrá enviarte un nuevo acceso por WhatsApp." };
  }

  // --- LOGIN BLINDADO (PROTECCIÓN FUERZA BRUTA) ---
  async login(username: string, contrasena: string) {
    if (!username) throw new BadRequestException("Username es obligatorio");

    const query = this.usersRepository.createQueryBuilder("user")
      .where("user.username = :username", { username })
      .addSelect("user.contrasena");

    const user = await query.getOne();

    if (!user) throw new UnauthorizedException("Credenciales inválidas.");
    
    if (user.bloqueadoHasta && new Date() < user.bloqueadoHasta) {
        const tiempoRestante = Math.ceil((user.bloqueadoHasta.getTime() - new Date().getTime()) / 60000);
        throw new ForbiddenException(`Cuenta bloqueada. Intenta en ${tiempoRestante} minutos.`);
    }

    if (user.estatus !== UserStatus.ACTIVO) throw new UnauthorizedException("Cuenta no activada.");

    const { data, error } = await this.supabaseService.client.auth.signInWithPassword({
        email: user.email, 
        password: contrasena
    });

    if (error) {
        user.intentosFallidos = (user.intentosFallidos || 0) + 1;
        if (user.intentosFallidos >= 5) {
            const bloqueo = new Date();
            bloqueo.setMinutes(bloqueo.getMinutes() + 15); 
            user.bloqueadoHasta = bloqueo;
        }
        await this.usersRepository.save(user);
        throw new UnauthorizedException("Contraseña incorrecta.");
    }

    if (user.intentosFallidos > 0 || user.bloqueadoHasta) {
        user.intentosFallidos = 0;
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