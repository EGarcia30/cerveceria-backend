// api/routes/mesas.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ✅ GET /api/mesas?page=1&limit=10&estado=disponible
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const estado = req.query.estado || null;

        // ✅ MÉTODO 2: JavaScript TZ El Salvador (más seguro)
        const fechaActual = new Date().toLocaleDateString('sv-SV', { 
            timeZone: 'America/El_Salvador',
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).split('/').reverse().join('-');

        // 1. ACTUALIZAR ESTADO MESAS (SOLO cuentas HOY)
        await db.query(`
            UPDATE public.mesas m
            SET estado = CASE 
                WHEN EXISTS (
                    SELECT 1 FROM public.cuentas c 
                    WHERE c.mesa_id = m.id 
                    AND c.estado = 'pendiente'
                    AND c.fecha_creado >= $1  -- ✅ SOLO HOY
                ) THEN 'ocupada'
                ELSE 'disponible'
            END
        `, [fechaActual]);

        // 2. QUERY MESAS con filtros
        let query = `
            SELECT id, numero_mesa, estado, fecha_creado 
            FROM public.mesas 
            WHERE 1=1
        `;
        let queryParams = [];
        let paramIndex = 1;

        if (estado) {
            query += ` AND estado = $${paramIndex}`;
            queryParams.push(estado);
            paramIndex++;
        }

        query += `
            ORDER BY id ASC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        queryParams.push(limit, offset);

        const [countResult, mesasResult] = await Promise.all([
            // ✅ COUNT también con lógica actualizada
            db.query(`
                SELECT COUNT(*) as total 
                FROM public.mesas m
                WHERE 1=1
                ${estado ? `AND (CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM public.cuentas c 
                        WHERE c.mesa_id = m.id 
                        AND c.estado = 'pendiente'
                        AND c.fecha_creado >= '${hoyInicio.toISOString()}'
                    ) THEN 'ocupada' ELSE 'disponible' END) = '${estado}'` : ''}
            `),
            db.query(query, queryParams)
        ]);

        res.json({
            success: true,
            data: mesasResult.rows,
            pagination: {
                page,
                limit,
                totalItems: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
            }
        });
    } catch (error) {
        console.error('❌ Error GET mesas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GET /api/mesas/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            'SELECT id, numero_mesa, estado, fecha_creado FROM public.mesas WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Mesa no encontrada' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('❌ Error GET mesa:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ POST /api/mesas
router.post('/', async (req, res) => {
    try {
        // ✅ MÉTODO 2: JavaScript TZ El Salvador (más seguro)
        const fechaActual = new Date().toLocaleDateString('sv-SV', { 
            timeZone: 'America/El_Salvador',
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).split('/').reverse().join('-'); // "2026-01-02"

        const { numero_mesa, estado = 'disponible' } = req.body;
        
        if (!numero_mesa || numero_mesa <= 0) {
            return res.status(400).json({ success: false, error: 'Número de mesa requerido y debe ser > 0' });
        }

        // Verificar si ya existe
        const existe = await db.query(
            'SELECT id FROM public.mesas WHERE numero_mesa = $1',
            [numero_mesa]
        );

        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Número de mesa ya existe' });
        }

        const result = await db.query(
            `INSERT INTO public.mesas (numero_mesa, estado, fecha_creado) 
            VALUES ($1, $2, $3) 
            RETURNING id, numero_mesa, estado, fecha_creado`,
            [numero_mesa, estado, fechaActual]
        );

        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('❌ Error POST mesa:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ PATCH /api/mesas/:id
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { numero_mesa, estado } = req.body;

        // Verificar si existe
        const mesaExiste = await db.query(
            'SELECT id FROM public.mesas WHERE id = $1',
            [id]
        );

        if (mesaExiste.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Mesa no encontrada' });
        }

        let query = 'UPDATE public.mesas SET ';
        let params = [];
        let paramIndex = 1;

        if (numero_mesa !== undefined) {
            // Verificar número único (si cambia)
            if (numero_mesa !== mesaExiste.rows[0].numero_mesa) {
                const numeroExiste = await db.query(
                    'SELECT id FROM public.mesas WHERE numero_mesa = $1 AND id != $2',
                    [numero_mesa, id]
                );
                if (numeroExiste.rows.length > 0) {
                    return res.status(400).json({ success: false, error: 'Número de mesa ya existe' });
                }
            }
            query += `numero_mesa = $${paramIndex}, `;
            params.push(numero_mesa);
            paramIndex++;
        }

        if (estado !== undefined) {
            if (!['disponible', 'ocupado'].includes(estado)) {
                return res.status(400).json({ success: false, error: 'Estado debe ser "disponible" o "ocupado"' });
            }
            query += `estado = $${paramIndex}, `;
            params.push(estado);
            paramIndex++;
        }

        // Remover última coma
        query = query.slice(0, -2);
        query += ` WHERE id = $${paramIndex} RETURNING id, numero_mesa, estado, fecha_creado`;
        params.push(id);

        const result = await db.query(query, params);
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('❌ Error PATCH mesa:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ DELETE /api/mesas/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar si tiene cuentas asociadas
        const cuentasAsociadas = await db.query(
            'SELECT id FROM public.cuentas WHERE mesa_id = $1 AND estado = "pendiente"',
            [id]
        );

        if (cuentasAsociadas.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: `No se puede eliminar. Hay ${cuentasAsociadas.rows.length} cuentas pendientes asociadas` 
            });
        }

        const result = await db.query(
            'DELETE FROM public.mesas WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Mesa no encontrada' });
        }

        res.json({ success: true, message: 'Mesa eliminada correctamente' });
    } catch (error) {
        console.error('❌ Error DELETE mesa:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;