// api/routes/gastosOperativos.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// RUTAS: GASTOS OPERATIVOS
// ============================================

// GET /api/gastos-operativos - Lista paginada
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const gastosQuery = `
        SELECT 
            go.id,
            go.descripcion,
            go.tipo_gasto,
            go.usuario_id,
            go.mesa_id,
            go.total::numeric,
            go.estado,
            go.fecha_creado,
            u.nombre as nombre_usuario,
            m.numero_mesa
        FROM public.gastos_operativos go
        LEFT JOIN public.usuarios u ON go.usuario_id = u.id
        LEFT JOIN public.mesas m ON go.mesa_id = m.id
        ORDER BY go.fecha_creado DESC, go.id DESC
        LIMIT $1 OFFSET $2
        `;

        const countQuery = `
        SELECT COUNT(*) as total 
        FROM public.gastos_operativos go
        `;

        const [gastos, countResult] = await Promise.all([
            db.query(gastosQuery, [limit, offset]),
            db.query(countQuery)
        ]);

        const totalItems = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            success: true,
            data: gastos.rows,
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
        console.error('Error al obtener gastos operativos:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// GET /api/gastos-operativos/all - Lista completa sin paginación
router.get('/all', async (req, res) => {
    try {
        const query = `
        SELECT 
            go.id,
            go.descripcion,
            go.tipo_gasto,
            go.usuario_id,
            go.total::numeric,
            go.estado,
            go.fecha_creado,
            u.nombre as nombre_usuario,
            m.numero_mesa
        FROM public.gastos_operativos go
        LEFT JOIN public.usuarios u ON go.usuario_id = u.id
        LEFT JOIN public.mesas m ON go.mesa_id = m.id
        ORDER BY go.fecha_creado DESC
        `;

        const result = await db.query(query);

        res.json({
            success: true,
            count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error('Error al obtener todos los gastos:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// ✅ POST /api/gastos-operativos - CREAR con HORA EL SALVADOR
router.post('/', async (req, res) => {
    try {
        const { descripcion, tipo_gasto, mesa_id, usuario_id, total, detalles } = req.body;
        
        // ✅ VALIDACIONES
        if (!descripcion || !usuario_id || !total || !detalles || detalles.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos obligatorios: descripcion, usuario_id, total, detalles'
            });
        }

        // ✅ HORA EL SALVADOR (CST UTC-6)
        const fechaLocal = new Date().toLocaleDateString('sv-SV', { 
            timeZone: 'America/El_Salvador',
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).split('/').reverse().join('-');

        // 1. INSERTAR GASTO PRINCIPAL
        const insertGastoQuery = `
        INSERT INTO public.gastos_operativos (
            descripcion, tipo_gasto, usuario_id, mesa_id, total, estado, fecha_creado
        ) VALUES ($1, $2, $3, $4, $5::numeric, 'pendiente', $6)
        RETURNING id
        `;
        
        const gastoResult = await db.query(insertGastoQuery, [
            descripcion, 
            tipo_gasto || 'consumo_personal', 
            usuario_id, 
            mesa_id || null, 
            total, 
            fechaLocal
        ]);

        const gastoId = gastoResult.rows[0].id;

        // 2. INSERTAR DETALLES
        const detallesPromises = detalles.map(detalle =>
            db.query(`
            INSERT INTO public.detalles_gastos (
                gasto_id, producto_id, cantidad_consumida, 
                precio_unitario, valor_total, fecha_creado
            ) VALUES ($1, $2, $3::numeric, $4::numeric, $5::numeric, $6)
            `, [
                gastoId,
                detalle.producto_id,
                detalle.cantidad_consumida,
                detalle.precio_unitario,
                detalle.valor_total,
                fechaLocal
            ])
        );

        await Promise.all(detallesPromises);

        // 3. RETORNAR GASTO CREADO
        const gastoCompleto = await db.query(`
        SELECT 
            go.id, go.descripcion, go.tipo_gasto, go.usuario_id, 
            go.mesa_id, go.total::numeric, go.estado, go.fecha_creado,
            u.nombre as nombre_usuario, m.numero_mesa
        FROM public.gastos_operativos go
        LEFT JOIN public.usuarios u ON go.usuario_id = u.id
        LEFT JOIN public.mesas m ON go.mesa_id = m.id
        WHERE go.id = $1
        `, [gastoId]);

        res.json({
            success: true,
            data: gastoCompleto.rows[0],
            message: 'Gasto operativo creado exitosamente'
        });

    } catch (error) {
        console.error('Error al crear gasto operativo:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// PUT /api/gastos-operativos/:id - Actualizar gasto existente
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { descripcion, tipo_gasto, total, detalles } = req.body;

        // Validaciones
        if (!descripcion || !tipo_gasto || !detalles || !Array.isArray(detalles)) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos o detalles inválido'
            });
        }

        // Iniciar transacción
        await db.query('BEGIN');

        // 1. Actualizar gasto principal
        const updateGastoQuery = `
            UPDATE public.gastos_operativos 
            SET descripcion = $1, 
                tipo_gasto = $2, 
                total = $3,
                fecha_modificado = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING id
        `;

        const gastoResult = await db.query(updateGastoQuery, [descripcion, tipo_gasto, total, id]);

        if (gastoResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'Gasto no encontrado'
            });
        }

        // 2. Eliminar detalles anteriores
        await db.query('DELETE FROM public.detalles_gastos WHERE gasto_id = $1', [id]);

        // 3. Insertar nuevos detalles
        const insertDetallesQuery = `
            INSERT INTO public.detalles_gastos (gasto_id, producto_id, cantidad_consumida, precio_unitario, valor_total)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const detalle of detalles) {
            await db.query(insertDetallesQuery, [
                id,
                detalle.producto_id,
                detalle.cantidad_consumida,
                detalle.precio_unitario,
                detalle.valor_total
            ]);
        }

        // Confirmar transacción
        await db.query('COMMIT');

        // Obtener gasto actualizado
        const gastoFinalQuery = `
            SELECT go.*, u.nombre as nombre_usuario 
            FROM public.gastos_operativos go
            LEFT JOIN public.usuarios u ON go.usuario_id = u.id
            WHERE go.id = $1
        `;

        const finalResult = await db.query(gastoFinalQuery, [id]);

        res.json({
            success: true,
            data: finalResult.rows[0],
            message: 'Gasto actualizado correctamente'
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error al actualizar gasto:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});


// PATCH /api/gastos-operativos/:id/estado - Cambiar estado (aprobar/rechazar)
router.patch('/:id/estado', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (!['aprobado', 'rechazado'].includes(estado)) {
            return res.status(400).json({
                success: false,
                message: 'Estado debe ser "aprobado" o "rechazado"'
            });
        }

        // ✅ HORA EL SALVADOR
        const fechaLocal = new Date().toLocaleString('sv-SV', {
            timeZone: 'America/El_Salvador',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).split('/').reverse().join('-');

        const updateQuery = `
        UPDATE public.gastos_operativos 
        SET estado = $1, fecha_modificado = $2
        WHERE id = $3
        RETURNING id, descripcion, total::numeric, estado, fecha_creado, fecha_modificado
        `;

        const result = await db.query(updateQuery, [estado, fechaLocal, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Gasto operativo no encontrado'
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
            message: `Gasto ${estado}`
        });

    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

// GET /api/gastos-operativos/:id - Detalle específico con productos
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // ✅ QUERY CORREGIDO - MÚLTIPLES DETALLES
        const gastoQuery = `
            SELECT 
                go.id, go.descripcion, go.tipo_gasto, go.usuario_id, 
                go.mesa_id, go.total::numeric, go.estado, go.fecha_creado,
                u.nombre as nombre_usuario, m.numero_mesa,
                json_agg(
                    json_build_object(
                        'producto_id', dg.producto_id,
                        'cantidad_consumida', dg.cantidad_consumida::numeric,
                        'precio_unitario', dg.precio_unitario::numeric,
                        'valor_total', dg.valor_total::numeric,
                        'descripcion', p.descripcion,
                        'presentacion', p.presentacion
                    )
                ) FILTER (WHERE dg.id IS NOT NULL) as detalles
            FROM public.gastos_operativos go
            LEFT JOIN public.usuarios u ON go.usuario_id = u.id
            LEFT JOIN public.mesas m ON go.mesa_id = m.id
            LEFT JOIN public.detalles_gastos dg ON go.id = dg.gasto_id
            LEFT JOIN public.productos p ON dg.producto_id = p.id
            WHERE go.id = $1
            GROUP BY go.id, go.descripcion, go.tipo_gasto, go.usuario_id, 
                    go.mesa_id, go.total, go.estado, go.fecha_creado,
                    u.nombre, m.numero_mesa  -- ✅ SOLO CAMPOS DEL GASTO PRINCIPAL
        `;

        const result = await db.query(gastoQuery, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Gasto no encontrado'
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error al obtener detalle:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

module.exports = router;