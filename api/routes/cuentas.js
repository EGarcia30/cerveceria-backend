// api/routes/cuentas.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ✅ GET /api/cuentas - SOLO PENDIENTES
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [countResult, cuentasResult] = await Promise.all([
            // ✅ COUNT solo pendientes
            db.query('SELECT COUNT(*) as total FROM public.cuentas WHERE estado = $1', ['pendiente']),
            db.query(`
                SELECT 
                    c.id, 
                    c.cliente, 
                    c.total,
                    c.estado, 
                    c.tipo_cuenta, 
                    c.mesa_id, 
                    m.numero_mesa,
                    c.fecha_creado
                FROM public.cuentas c
                LEFT JOIN public.mesas m ON c.mesa_id = m.id
                WHERE c.estado = $1  -- ✅ SOLO PENDIENTES
                ORDER BY c.fecha_creado DESC
                LIMIT $2 OFFSET $3
            `, ['pendiente', limit, offset])
        ]);

        res.json({
            success: true,
            data: cuentasResult.rows,
            pagination: {
                page, 
                limit,
                totalItems: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
            }
        });
    } catch (error) {
        console.error('🚨 ERROR GET cuentas pendientes:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            tableInfo: 'Verifica public.cuentas (estado=pendiente)'
        });
    }
});

// ✅GET /api/cuentas/historial (solo paginación)
router.get('/historial', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;
        const { periodo = 'todo', estado = 'todo' } = req.query;

        // ✅ SQL SIMPLE - IGUAL TU DASHBOARD
        let whereClause = '1=1';

        if (periodo !== 'todo') {
            const fechaSV = new Date().toLocaleDateString('sv-SV', {
                timeZone: 'America/El_Salvador',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).split('/').reverse().join('-');

            switch(periodo) {
                case 'hoy': whereClause += ` AND DATE(c.fecha_creado) = '${fechaSV}'`; break;
                case 'ayer':
                    const ayerSV = new Date(Date.now() - 86400000).toLocaleDateString('sv-SV', {
                        timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit'
                    }).split('/').reverse().join('-');
                    whereClause += ` AND DATE(c.fecha_creado) = '${ayerSV}'`; break;
                case 'semana': whereClause += ` AND DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '7 days'`; break;
                case 'mes': whereClause += ` AND DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '30 days'`; break;
                case 'año': whereClause += ` AND DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '365 days'`; break;
            }
        }

        if (estado !== 'todo') {
            whereClause += ` AND c.estado = '${estado}'`;
        }


        const countQuery = `
            SELECT COUNT(*) as total
            FROM public.cuentas c LEFT JOIN public.mesas m ON c.mesa_id = m.id
            WHERE ${whereClause}
        `;


        const dataQuery = `
            SELECT c.id, c.cliente, c.total, c.estado, c.tipo_cuenta,
            c.mesa_id, m.numero_mesa, c.fecha_creado
            FROM public.cuentas c LEFT JOIN public.mesas m ON c.mesa_id = m.id
            WHERE ${whereClause}
            ORDER BY c.id DESC
            LIMIT ${limit} OFFSET ${offset}
        `;


        const [countResult, dataResult] = await Promise.all([
            db.query(countQuery),
            db.query(dataQuery)
        ]);


        res.json({
            success: true,
            data: dataResult.rows,
            pagination: {
                page, limit,
                totalItems: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
            },
            filtros: { periodo, estado }
        });


    } catch (error) {
        console.error('🚨 ALL-HISTORIAL ERROR:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GET /api/cuentas/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [cuentaResult, detallesResult] = await Promise.all([
            db.query(`
                SELECT c.*, m.numero_mesa  -- ✅ JOIN mesa
                FROM public.cuentas c
                LEFT JOIN public.mesas m ON c.mesa_id = m.id
                WHERE c.id = $1
            `, [id]),
            db.query(`
                SELECT cd.*, p.descripcion, p.presentacion
                FROM public.cuentas_detalle cd
                JOIN public.productos p ON cd.producto_id = p.id
                WHERE cd.cuenta_id = $1
                ORDER BY cd.fecha_creado
            `, [id])
        ]);

        if (cuentaResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
        }

        res.json({
            success: true,
            data: { 
                ...cuentaResult.rows[0], 
                detalles: detallesResult.rows 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ✅ POST /api/cuentas
router.post('/', async (req, res) => {
    const { cliente, total, tipo_cuenta, mesa_id, detalles } = req.body;
    
    try {
        // ✅: JavaScript TZ El Salvador (más seguro)
        const fechaActual = new Date().toLocaleDateString('sv-SV', { 
            timeZone: 'America/El_Salvador',
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).split('/').reverse().join('-'); // "2026-01-02"

        // 1. Verificar mesa (si aplica)
        if (mesa_id) {
            const mesa = await db.query('SELECT estado FROM public.mesas WHERE id = $1', [mesa_id]);
            if (mesa.rows[0]?.estado === 'disponible') {
                // ✅ Comillas SIMPLES para strings
                const updateResult = await db.query(
                    'UPDATE public.mesas SET estado = $1 WHERE id = $2 RETURNING id, estado, numero_mesa',
                    ['ocupada', mesa_id]
                );
                console.log('🪑 UPDATE RESULT:', updateResult.rows);  // ← ¿Vacío? ¿Estado correcto?
            }
        }
        
        // 2. Crear cuenta
        const nuevaCuenta = await db.query(
            `INSERT INTO public.cuentas (cliente, total, tipo_cuenta, mesa_id, fecha_creado) 
            VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [cliente, total, tipo_cuenta, mesa_id || null, fechaActual]
        );
        
        const cuentaId = nuevaCuenta.rows[0].id;
        
        // 3. Insertar detalles
        for (const detalle of detalles) {
            await db.query(
                `INSERT INTO public.cuentas_detalle (cuenta_id, producto_id, cantidad_vendida, precio_compra_actual, precio_venta, fecha_creado)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [cuentaId, detalle.producto_id, detalle.cantidad_vendida, detalle.precio_compra_actual, detalle.precio_venta, fechaActual]
            );
        }
        
        res.status(201).json({ success: true, data: { id: cuentaId } });
        
    } catch (error) {
        console.error('❌ Error POST cuenta:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ PATCH /api/cuentas/:id/pagar - STRINGS CORRECTOS
router.patch('/:id/pagar', async (req, res) => {
    const { id } = req.params;
    
    try {
        // 1. Marcar cuenta como pagada
        const cuentaResult = await db.query(`
            UPDATE public.cuentas 
            SET estado = $1 
            WHERE id = $2 AND estado = $3
            RETURNING mesa_id
        `, ['pagado', id, 'pendiente']);  // ✅ Parámetros
        
        if (cuentaResult.rows.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cuenta no encontrada o ya pagada' 
            });
        }
        
        const mesaId = cuentaResult.rows[0].mesa_id;
        let mesaLiberada = false;
        
        // 2. Si tiene mesa → verificar si liberar
        if (mesaId) {
            const pendientesQuery = await db.query(`
                SELECT COUNT(*) as pendientes 
                FROM public.cuentas 
                WHERE mesa_id = $1 AND estado = $2
            `, [mesaId, 'pendiente']);
            
            const pendientes = parseInt(pendientesQuery.rows[0].pendientes);
            
            if (pendientes === 0) {
                // ✅ Comillas SIMPLES
                await db.query(
                    'UPDATE public.mesas SET estado = $1 WHERE id = $2',
                    ['disponible', mesaId]
                );
                mesaLiberada = true;
            }
        }
        
        res.json({ 
            success: true, 
            message: `Cuenta #${id} marcada como pagada` + 
                (mesaId ? ` | Mesa ${mesaId} ${mesaLiberada ? '✅ LIBERADA' : '🪑 sigue ocupada'}` : '')
        });
        
    } catch (error) {
        console.error('❌ Error pagar cuenta:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Agregar este endpoint a cuentas.js
// ✅ PATCH /api/cuentas/:id - ESTILO IDENTICO al GET
router.patch('/:id', async (req, res) => {
    try {
        // ✅ MÉTODO 2: JavaScript TZ El Salvador (más seguro)
        const fechaActual = new Date().toLocaleDateString('sv-SV', { 
            timeZone: 'America/El_Salvador',
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).split('/').reverse().join('-'); // "2026-01-02"

        const { id } = req.params;
        const { cliente, tipo_cuenta, mesa_id, detalles } = req.body;

        // 1. Verificar cuenta existe y es pendiente
        const cuentaCheck = await db.query(
            'SELECT id FROM public.cuentas WHERE id = $1 AND estado = $2', 
            [id, 'pendiente']
        );

        if (cuentaCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: `Cuenta ${id} no encontrada o ya pagada`
            });
        }

        // 2. Promise.all para UPDATE y DELETE (estilo GET)
        const [updateResult, deleteResult] = await Promise.all([
            // Actualizar cuenta principal
            db.query(`
                UPDATE public.cuentas 
                SET cliente = $1, tipo_cuenta = $2, mesa_id = $3 
                WHERE id = $4
            `, [cliente, tipo_cuenta, mesa_id || null, id]),
            
            // Borrar detalles viejos
            db.query('DELETE FROM public.cuentas_detalle WHERE cuenta_id = $1', [id])
        ]);

        // 3. Insertar nuevos detalles (si existen)
        if (detalles && detalles.length > 0) {
            for (const detalle of detalles) {
                await db.query(`
                    INSERT INTO public.cuentas_detalle 
                    (cuenta_id, producto_id, cantidad_vendida, precio_venta, precio_compra_actual, fecha_creado)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    id, 
                    detalle.producto_id, 
                    parseInt(detalle.cantidad_vendida), 
                    parseFloat(detalle.precio_venta),
                    parseFloat(detalle.precio_compra_actual) || 0,
                    fechaActual
                ]);
            }
        }

        // 4. Recalcular total
        const totalResult = await db.query(`
            SELECT COALESCE(SUM(cantidad_vendida * precio_venta), 0) as total
            FROM public.cuentas_detalle 
            WHERE cuenta_id = $1
        `, [id]);

        const total = parseFloat(totalResult.rows[0].total) || 0.00;
        
        await db.query(
            'UPDATE public.cuentas SET total = $1 WHERE id = $2', 
            [total, id]
        );

        if (mesa_id) {
            const updateResult = await db.query(
                    'UPDATE public.mesas SET estado = $1 WHERE id = $2 RETURNING id, estado, numero_mesa',
                    ['ocupada', mesa_id]
                );
                console.log('🪑 UPDATE RESULT:', updateResult.rows);  // ← ¿Vacío? ¿Estado correcto?
        }

        res.json({
            success: true,
            message: `Cuenta ${id} actualizada correctamente`,
            data: { id, cliente, total, productos: detalles?.length || 0 }
        });

    } catch (error) {
        console.error('🚨 ERROR PATCH cuentas:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            debug: 'Verifica: public.cuentas_detalle (columnas: cuenta_id, producto_id, cantidad_vendida, precio_venta)'
        });
    }
});

module.exports = router;