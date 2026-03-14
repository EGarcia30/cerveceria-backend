// api/routes/productos.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// RUTAS: PRODUCTOS (INVENTARIO)
// ============================================

// GET /api/productos - Lista paginada con FILTRO POR CATEGORÍA (FIX)
router.get('/', async (req, res) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const categoria = req.query.categoria || 'N/A';
        const search = req.query.search || '';

        let whereConditions = ['p.activo = true'];
        let params = [];
        let paramIndex = 1;

        // FILTRO CATEGORIA
        if (categoria !== 'N/A') {
            whereConditions.push(`c.codigo = $${paramIndex}`);
            params.push(categoria);
            paramIndex++;
        }

        // FILTRO BUSQUEDA
        if (search !== '') {
            whereConditions.push(`(
                p.descripcion ILIKE $${paramIndex}
                OR p.proveedor ILIKE $${paramIndex}
                OR p.presentacion ILIKE $${paramIndex}
                OR c.codigo ILIKE $${paramIndex}
            )`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        const whereClause = whereConditions.join(' AND ');

        const productosQuery = `
        SELECT 
            p.id, p.descripcion, p.proveedor, p.presentacion,
            p.cantidad_disponible::numeric, p.cantidad_minima::numeric,
            p.cantidad_maxima::numeric, p.precio_compra::numeric, 
            p.precio_venta::numeric, p.precio_venta::numeric as precio_venta_original,
            p.fecha_creado, p.activo,
            c.codigo as categoria_codigo, 
            c.nombre as categoria_nombre, 
            c.id as categoria_id
        FROM public.productos p
        LEFT JOIN public.categorias c ON p.categoria_id = c.id
        WHERE ${whereClause}
        ORDER BY p.id DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const countQuery = `
        SELECT COUNT(*) as total
        FROM public.productos p
        LEFT JOIN public.categorias c ON p.categoria_id = c.id
        WHERE ${whereClause}
        `;

        const productosParams = [...params, limit, offset];

        const [productos, countResult] = await Promise.all([
            db.query(productosQuery, productosParams),
            db.query(countQuery, params)
        ]);

        const totalItems = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            success: true,
            data: productos.rows,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
                categoria,
                search
            }
        });

    } catch (error) {
        console.error('Error al obtener productos:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// GET /api/productos/all - Lista completa de productos activos sin paginación
router.get('/all', async (req, res) => {
    try {
        const query = `
        SELECT 
            id, 
            descripcion, 
            proveedor, 
            presentacion,
            cantidad_disponible::numeric,
            cantidad_minima::numeric,
            cantidad_maxima::numeric,
            precio_compra::numeric,
            precio_venta::numeric,
            fecha_creado, 
            activo
        FROM public.productos 
        WHERE activo = true
        ORDER BY descripcion ASC`; // Ordenado alfabéticamente para facilitar la búsqueda

        const result = await db.query(query);

        res.json({
            success: true,
            count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error('Error al obtener todos los productos:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// 1. TOGGLE ACTIVO/INACTIVO
router.patch('/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const { activo } = req.body;

        // Validar campo activo
        if (typeof activo !== 'boolean') {
            return res.status(400).json({ 
                success: false,
                message: 'Campo "activo" debe ser boolean (true/false)' 
            });
        }

        const toggleQuery = `
            UPDATE public.productos 
            SET activo = $1
            WHERE id = $2
            RETURNING id, descripcion, proveedor, presentacion,
                    cantidad_disponible::numeric, cantidad_minima::numeric, 
                    cantidad_maxima::numeric, precio_compra::numeric, 
                    precio_venta::numeric, fecha_creado, activo
        `;

        const result = await db.query(toggleQuery, [activo, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Producto no encontrado' 
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
            message: `Producto ${activo ? 'activado' : 'desactivado'}`
        });

    } catch (error) {
        console.error('Error al toggle producto:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// ✅ PATCH /api/productos/:id - CON CATEGORÍA Completa (INSERT + SELECT)
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Validar que existan campos
        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ 
                success: false,
                message: 'Debe enviar al menos un campo para actualizar'
            });
        }

        // 1. UPDATE dinámico
        const setClause = Object.keys(updates)
            .map(key => `${key} = $${Object.keys(updates).indexOf(key) + 1}`)
            .join(', ');

        const updateQuery = `
            UPDATE public.productos 
            SET ${setClause}
            WHERE id = $${Object.keys(updates).length + 1}
            RETURNING id
        `;

        const values = [...Object.values(updates), id];
        const updateResult = await db.query(updateQuery, values);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Producto no encontrado' 
            });
        }

        const updatedId = updateResult.rows[0].id;

        // 2. SELECT completo CON CATEGORÍA
        const selectQuery = `
            SELECT 
                p.id, p.descripcion, p.proveedor, p.presentacion,
                p.cantidad_disponible::numeric, p.cantidad_minima::numeric, 
                p.cantidad_maxima::numeric, p.precio_compra::numeric, 
                p.precio_venta::numeric, p.categoria_id, p.fecha_creado, p.activo,
                c.codigo as categoria_codigo,
                c.nombre as categoria_nombre
            FROM public.productos p
            LEFT JOIN public.categorias c ON p.categoria_id = c.id
            WHERE p.id = $1
        `;
        
        const productoCompleto = await db.query(selectQuery, [updatedId]);
        
        res.json({
            success: true,
            data: productoCompleto.rows[0]
        });

    } catch (error) {
        console.error('Error al actualizar producto:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// ✅ POST /api/productos - CREAR nuevo producto con FECHA LOCAL (sin hora) y CATEGORÍA
router.post('/', async (req, res) => {
    try {
        const producto = req.body;
        
        const fechaLocal = new Date().toLocaleString('sv-SV', {
            timeZone: 'America/El_Salvador',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).split('/').reverse().join('-');

        // 1. INSERT básico
        const insertQuery = `
            INSERT INTO public.productos (
                descripcion, proveedor, presentacion, 
                cantidad_disponible, cantidad_minima, cantidad_maxima,
                precio_compra, precio_venta, categoria_id, activo, fecha_creado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 1), true, $10)
            RETURNING id
        `;
        
        const insertValues = [
            producto.descripcion, producto.proveedor, producto.presentacion,
            producto.cantidad_disponible, producto.cantidad_minima, producto.cantidad_maxima,
            producto.precio_compra, producto.precio_venta,
            producto.categoria_id,
            fechaLocal
        ];
        
        const insertResult = await db.query(insertQuery, insertValues);
        const newId = insertResult.rows[0].id;

        // 2. SELECT completo con categoría
        const selectQuery = `
            SELECT 
                p.id, p.descripcion, p.proveedor, p.presentacion,
                p.cantidad_disponible::numeric, p.cantidad_minima::numeric, 
                p.cantidad_maxima::numeric, p.precio_compra::numeric, 
                p.precio_venta::numeric, p.categoria_id, p.fecha_creado, p.activo,
                c.codigo as categoria_codigo, c.nombre as categoria_nombre
            FROM public.productos p
            LEFT JOIN public.categorias c ON p.categoria_id = c.id
            WHERE p.id = $1
        `;
        
        const productoCompleto = await db.query(selectQuery, [newId]);
        
        res.json({
            success: true,
            data: productoCompleto.rows[0]
        });
    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;