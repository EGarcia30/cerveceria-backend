// api/routes/usuarios.js - TU ESTILO EXACTO ✅
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');

// GET /api/usuarios ✅ IGUAL QUE CUENTAS
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const [countResult, usuariosResult] = await Promise.all([
      db.query(`
        SELECT COUNT(*) as total 
        FROM public.usuarios 
        WHERE activo = true 
        AND (nombre ILIKE $1 OR email ILIKE $1)
      `, [`%${search}%`]),
      
      db.query(`
        SELECT 
          id, nombre, email, rol, activo, fecha_creado
        FROM public.usuarios 
        WHERE activo = true 
        AND (nombre ILIKE $1 OR email ILIKE $1)
        ORDER BY fecha_creado DESC
        LIMIT $2 OFFSET $3
      `, [`%${search}%`, limit, offset])
    ]);

    res.json({
      success: true,
      data: usuariosResult.rows,
      pagination: {
        page, 
        limit,
        totalItems: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
      }
    });
  } catch (error) {
    console.error('🚨 ERROR GET usuarios:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      tableInfo: 'Verifica public.usuarios (activo=true)'
    });
  }
});

// POST /api/usuarios ✅ IGUAL ESTILO
router.post('/', async (req, res) => {
  try {
    const { nombre, email, password, rol} = req.body;
    const password_hash = await bcrypt.hash(password, 12);
    
    const result = await db.query(
      `INSERT INTO public.usuarios (nombre, email, password_hash, rol, activo) 
       VALUES ($1, $2, $3, $4, true) 
       RETURNING id, nombre, email, rol, activo, fecha_creado`,
      [nombre, email, password_hash, rol || 'cajero']
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('🚨 CREATE USER:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, password, rol, activo = true } = req.body;
    
    let query, values;
    if (password) {
      const password_hash = await bcrypt.hash(password, 12);
      query = `
        UPDATE public.usuarios 
        SET nombre=$1, email=$2, password_hash=$3, rol=$4 
        WHERE id=$5 
        RETURNING *
      `;
      values = [nombre, email, password_hash, rol, id];
    } else {
      query = `
        UPDATE public.usuarios 
        SET nombre=$1, email=$2, rol=$3
        WHERE id=$4 
        RETURNING *
      `;
      values = [nombre, email, rol, id];
    }
    
    const result = await db.query(query, values);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('🚨 UPDATE USER:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/usuarios/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'UPDATE public.usuarios SET activo = false WHERE id = $1 RETURNING id', 
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('🚨 DELETE USER:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { nombre, password } = req.body;
    
    if (!nombre || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nombre y contraseña son requeridos' 
      });
    }

    // Buscar usuario por nombre (tu schema exacto)
    const result = await db.query(
      `SELECT id, nombre, email, password_hash, rol, activo 
        FROM public.usuarios 
        WHERE nombre ILIKE $1 AND activo = true`,
      [nombre]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario no encontrado o inactivo' 
      });
    }

    const usuario = result.rows[0];

    // Verificar password_hash (bcryptjs igual que usas)
    const isValidPassword = await bcrypt.compare(password, usuario.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Contraseña incorrecta' 
      });
    }

    // JWT (frontend lo espera)
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      process.env.JWT_SECRET || 'las-tonitas-super-secreto-2026',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      data: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        activo: usuario.activo
      }
    });

  } catch (error) {
    console.error('🚨 ERROR LOGIN:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      tableInfo: 'Verifica public.usuarios (nombre/password_hash)'
    });
  }
});

// 🚪 POST /api/usuarios/logout - SIMPLE TU ESTILO
router.post('/logout', async (req, res) => {
  try {
    // Logout solo limpia frontend (localStorage)
    // Backend no necesita blacklisting (JWT stateless)
    res.json({ 
      success: true, 
      message: 'Sesión cerrada correctamente' 
    });
  } catch (error) {
    console.error('🚨 ERROR LOGOUT:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔐 JWT MIDDLEWARE (para rutas protegidas)
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token de acceso requerido' 
      });
    }

    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'las-tonitas-super-secreto-2026'
    );
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error('🚨 TOKEN ERROR:', error.message);
    res.status(403).json({ 
      success: false, 
      error: 'Token inválido o expirado' 
    });
  }
};

module.exports = router;