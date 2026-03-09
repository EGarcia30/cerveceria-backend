// api/routes/compras.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// RUTAS: PRODUCTOS (para módulo de compras)
// ============================================

// ✅ GET /api/compras?page=1&limit=10 - SOLO DATOS BÁSICOS
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Conteo total
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM public.compras
        `;

        // SOLO compras básicas (SIN JOINs complejos)
        const comprasQuery = `
            SELECT 
                id, 
                proveedor, 
                direccion, 
                total::numeric, 
                estado, 
                fecha_creado
            FROM public.compras
            ORDER BY id DESC
            LIMIT $1 OFFSET $2
        `;

        const [countResult, comprasResult] = await Promise.all([
            db.query(countQuery),
            db.query(comprasQuery, [limit, offset])
        ]);

        const totalItems = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            success: true,
            data: comprasResult.rows,
            pagination: {
                page, limit, totalItems, totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Error al obtener compras:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// ✅ GET /api/compras/:id - DETALLE COMPLETO
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Compra principal
        const compraQuery = `
            SELECT c.*, 
                COUNT(cd.id) as total_detalles
            FROM public.compras c
            LEFT JOIN public.compras_detalle cd ON c.id = cd.compra_id
            WHERE c.id = $1
            GROUP BY c.id
        `;

        // Detalles completos con productos
        const detallesQuery = `
            SELECT 
                cd.id,
                cd.compra_id,
                cd.producto_id,
                cd.cantidad_vendida::numeric,
                cd.precio_compra_actual::numeric,
                cd.precio_venta::numeric,
                cd.fecha_creado,
                p.descripcion,
                p.presentacion
            FROM public.compras_detalle cd
            JOIN public.productos p ON cd.producto_id = p.id
            WHERE cd.compra_id = $1
            ORDER BY cd.fecha_creado
        `;

        const [compraResult, detallesResult] = await Promise.all([
            db.query(compraQuery, [id]),
            db.query(detallesQuery, [id])
        ]);

        if (compraResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Compra no encontrada' 
            });
        }

        res.json({
            success: true,
            data: {
                ...compraResult.rows[0],
                detalles: detallesResult.rows
            }
        });

    } catch (error) {
        console.error('Error al obtener detalle de compra:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// ✅ POST /api/compras - FECHA ACTUAL sin hora/minutos
router.post('/', async (req, res) => {
    const { proveedor, direccion, total, estado, detalles } = req.body;
    
    try {
        await db.query('BEGIN');
        
        // ✅: JavaScript TZ El Salvador (más seguro)
        const fechaActual = new Date().toLocaleDateString('sv-SV', { 
            timeZone: 'America/El_Salvador',
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).split('/').reverse().join('-'); //
        
        // 1. Crear compra CON fecha solo
        const compraResult = await db.query(
            `INSERT INTO public.compras (proveedor, direccion, total, estado, fecha_creado) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [proveedor, direccion, total, estado, fechaActual]
        );
        const compraId = compraResult.rows[0].id;
        
        // 2. Crear detalles
        for (const detalle of detalles) {
            await db.query(
                `INSERT INTO public.compras_detalle 
                (compra_id, producto_id, cantidad_vendida, precio_compra_actual, precio_venta, fecha_creado)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [compraId, detalle.producto_id, detalle.cantidad_vendida, detalle.precio_compra_actual, detalle.precio_venta, fechaActual]
            );
        }
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true, 
            data: compraResult.rows[0],
            fecha: fechaActual
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('🚨 Error creando compra:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ PUT /api/compras/:id - EDITAR COMPRA (solo si no está pagada)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { proveedor, direccion, total, estado, detalles } = req.body;
    
    try {
        await db.query('BEGIN');
        
        // 1. Verificar si la compra existe y NO está pagada
        const verificaCompra = await db.query(
            `SELECT id, estado FROM public.compras WHERE id = $1`,
            [id]
        );
        
        if (verificaCompra.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                error: 'Compra no encontrada' 
            });
        }
        
        if (verificaCompra.rows[0].estado === 'pagado') {
            await db.query('ROLLBACK');
            return res.status(400).json({ 
                success: false,
                error: 'No se pueden editar compras ya pagadas' 
            });
        }
        
        // ✅ FECHA ACTUAL para auditoría (mantener original)
        const fechaActual = new Date().toLocaleDateString('sv-SV', { 
            timeZone: 'America/El_Salvador',
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).split('/').reverse().join('-');
        
        // 2. ACTUALIZAR compra principal
        const updateCompra = await db.query(
            `UPDATE public.compras 
             SET proveedor = $1, 
                 direccion = $2, 
                 total = $3
             WHERE id = $4 RETURNING *`,
            [proveedor, direccion, total, id]
        );
        
        // 3. ELIMINAR detalles anteriores
        await db.query(
            `DELETE FROM public.compras_detalle WHERE compra_id = $1`,
            [id]
        );
        
        // 4. INSERTAR nuevos detalles
        for (const detalle of detalles) {
            await db.query(
                `INSERT INTO public.compras_detalle 
                (compra_id, producto_id, cantidad_vendida, precio_compra_actual, precio_venta, fecha_creado)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, detalle.producto_id, detalle.cantidad_vendida, detalle.precio_compra_actual, detalle.precio_venta, fechaActual]
            );
        }
        
        await db.query('COMMIT');
        
        res.json({ 
            success: true, 
            data: updateCompra.rows[0],
            message: 'Compra actualizada exitosamente'
        });
        
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('🚨 Error editando compra:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// ✅ PATCH /api/compras/:id/pagar - MARCAR PAGADO + ACTUALIZAR STOCK
router.patch('/:id/pagar', async (req, res) => {
    const compraId = req.params.id;
    
    try {
        await db.query('BEGIN');
    
        // 1. Marcar compra como pagada
        const updateCompra = await db.query(
            `UPDATE public.compras 
            SET estado = $1 
            WHERE id = $2 AND estado = 'pendiente' 
             RETURNING *`,
            ['pagado', compraId]
        );

        if (updateCompra.rowCount === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ 
                success: false,
                error: 'Compra no encontrada o ya pagada' 
            });
        }
    
        // 2. Actualizar stock productos (SUMAR al stock disponible)
        const detalles = await db.query(
            `SELECT cd.producto_id, cd.cantidad_vendida 
            FROM public.compras_detalle cd 
            WHERE cd.compra_id = $1`,
            [compraId]
        );
    
        for (const detalle of detalles.rows) {
            await db.query(
                `UPDATE public.productos 
                SET cantidad_disponible = cantidad_disponible + $1 
                WHERE id = $2`,
                [detalle.cantidad_vendida, detalle.producto_id]
            );
        }
        await db.query('COMMIT');
        res.json({ 
            success: true,
            message: 'Compra marcada como pagada y stock actualizado' 
        });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error pagando compra:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

module.exports = router;