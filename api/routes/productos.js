// api/routes/productos.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// RUTAS: PRODUCTOS (INVENTARIO)
// ============================================

// GET /api/productos - Lista paginada de productos
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Consulta principal con paginación y solo activos
        // En la consulta SQL, agrega CAST:
        const productosQuery = `
        SELECT 
            id, 
            descripcion, 
            proveedor, 
            presentacion,
            cantidad_disponible::numeric,  -- ✅ Fuerza numeric
            cantidad_minima::numeric,
            cantidad_maxima::numeric,
            precio_compra::numeric,        -- ✅ Fuerza numeric
            precio_venta::numeric,          -- ✅ Fuerza numeric
            precio_venta::numeric as precio_venta_original,       -- ✅ Fuerza numeric
            fecha_creado, 
            activo
        FROM public.productos 
        WHERE activo = true
        ORDER BY id DESC
        LIMIT $1 OFFSET $2
        `;


        // Conteo total para paginación
        const countQuery = `
        SELECT COUNT(*) as total 
        FROM public.productos 
        WHERE activo = true
        `;

        const [productos, countResult] = await Promise.all([
        db.query(productosQuery, [limit, offset]),
        db.query(countQuery)
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
            hasPrev: page > 1
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

// 2. EDITAR Producto (UPDATE completo)
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

        // Construir UPDATE dinámico
        const setClause = Object.keys(updates)
            .map(key => `${key} = $${Object.keys(updates).indexOf(key) + 1}`)
            .join(', ');

        const updateQuery = `
            UPDATE public.productos 
            SET ${setClause}
            WHERE id = $${Object.keys(updates).length + 1}
            RETURNING id, descripcion, proveedor, presentacion,
                    cantidad_disponible::numeric, cantidad_minima::numeric, 
                    cantidad_maxima::numeric, precio_compra::numeric, 
                    precio_venta::numeric, fecha_creado, activo
        `;

        const values = [...Object.values(updates), id];
        const result = await db.query(updateQuery, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Producto no encontrado' 
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
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

// ✅ POST /api/productos - CREAR con HORA EL SALVADOR
router.post('/', async (req, res) => {
    try {
        const producto = req.body;
        
        // ✅ HORA EL SALVADOR (CST UTC-6)
        const fechaLocal = new Date().toLocaleString('sv-SV', {
            timeZone: 'America/El_Salvador',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).split('/').reverse().join('-');

        const insertQuery = `
            INSERT INTO public.productos (
                descripcion, proveedor, presentacion, 
                cantidad_disponible, cantidad_minima, cantidad_maxima,
                precio_compra, precio_venta, activo, fecha_creado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
            RETURNING id, descripcion, proveedor, presentacion,
                    cantidad_disponible::numeric, cantidad_minima::numeric, 
                    cantidad_maxima::numeric, precio_compra::numeric, 
                    precio_venta::numeric, fecha_creado, activo
        `;
        
        const values = [
            producto.descripcion, producto.proveedor, producto.presentacion,
            producto.cantidad_disponible, producto.cantidad_minima, producto.cantidad_maxima,
            producto.precio_compra, producto.precio_venta,
            fechaLocal  // ✅ $9 = HORA EL SALVADOR
        ];
        
        const result = await db.query(insertQuery, values);
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;