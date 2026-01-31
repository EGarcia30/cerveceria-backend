// api/routes/promociones.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/promociones?ids=1,2,3 - EXISTENTE
router.get('/', async (req, res) => {
    try {
        const { ids } = req.query;

        if (!ids) {
        return res.status(400).json({
            success: false,
            error: 'Parámetro ids es requerido, ejemplo: ?ids=1,2,3'
        });
        }

        const idsArray = ids.split(',').map(id => parseInt(id)).filter(Boolean);

        if (idsArray.length === 0) {
        return res.json({ success: true, data: [] });
        }

        const result = await db.query(
        `
        SELECT 
            pr.id,
            pr.nombre_promocion,
            pr.producto_id,
            pr.nuevo_precio_venta,
            pr.activo,
            pr.fecha_inicio,
            pr.fecha_fin
        FROM public.promociones pr
        WHERE pr.activo = true
        AND pr.producto_id = ANY($1)
        `,
        [idsArray]
        );

        res.json({
        success: true,
        data: result.rows
        });
    } catch (error) {
        console.error('❌ Error GET /promociones:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/promociones/all
router.get('/all', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                pr.id,
                pr.nombre_promocion,
                pr.producto_id,
                pr.nuevo_precio_venta,
                pr.activo,
                pr.fecha_inicio,
                pr.fecha_fin,
                pr.fecha_creado
            FROM public.promociones pr
            WHERE pr.activo = true
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('❌ Error GET /promociones/all:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GET /api/promociones/:id - Obtener por ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            SELECT 
                pr.id,
                pr.nombre_promocion,
                pr.producto_id,
                pr.nuevo_precio_venta,
                pr.activo,
                pr.fecha_inicio,
                pr.fecha_fin,
                pr.fecha_creado
            FROM public.promociones pr
            WHERE pr.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Promoción no encontrada' 
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error GET /promociones/:id:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ POST /api/promociones - Crear nueva promoción
router.post('/', async (req, res) => {
    try {
        const { nombre_promocion, producto_id, nuevo_precio_venta, fecha_inicio, fecha_fin } = req.body;

        if (!nombre_promocion || !producto_id || !nuevo_precio_venta) {
            return res.status(400).json({ 
                success: false, 
                error: 'nombre_promocion, producto_id y nuevo_precio_venta son requeridos' 
            });
        }

        const result = await db.query(`
            INSERT INTO promociones (nombre_promocion, producto_id, nuevo_precio_venta, fecha_inicio, fecha_fin)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, nombre_promocion, producto_id, nuevo_precio_venta, activo, fecha_inicio, fecha_fin, fecha_creado
        `, [nombre_promocion, producto_id, nuevo_precio_venta, fecha_inicio, fecha_fin]);

        res.status(201).json({
            success: true,
            message: 'Promoción creada exitosamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error POST /promociones:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ PUT /api/promociones/:id - Actualizar promoción
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_promocion, producto_id, nuevo_precio_venta, fecha_inicio, fecha_fin, activo } = req.body;

        // Verificar existencia
        const exists = await db.query('SELECT id FROM promociones WHERE id = $1', [id]);
        if (exists.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Promoción no encontrada' 
            });
        }

        const result = await db.query(`
            UPDATE promociones 
            SET nombre_promocion = $1,
                producto_id = $2,
                nuevo_precio_venta = $3,
                fecha_inicio = $4,
                fecha_fin = $5,
                activo = COALESCE($6, activo)
            WHERE id = $7
            RETURNING id, nombre_promocion, producto_id, nuevo_precio_venta, activo, fecha_inicio, fecha_fin, fecha_creado
        `, [nombre_promocion, producto_id, nuevo_precio_venta, fecha_inicio, fecha_fin, activo, id]);

        res.json({
            success: true,
            message: 'Promoción actualizada exitosamente',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Error PUT /promociones/:id:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ DELETE /api/promociones/:id - Soft delete (activo = false)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar existencia
        const exists = await db.query('SELECT id FROM promociones WHERE id = $1', [id]);
        if (exists.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Promoción no encontrada' 
            });
        }

        const result = await db.query(`
            UPDATE promociones 
            SET activo = false 
            WHERE id = $1 
            RETURNING id
        `, [id]);

        res.json({
            success: true,
            message: 'Promoción desactivada exitosamente',
            data: { id: result.rows[0].id }
        });
    } catch (error) {
        console.error('❌ Error DELETE /promociones/:id:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GET /api/promociones/producto/:producto_id - Promociones por producto
router.get('/producto/:producto_id', async (req, res) => {
    try {
        const { producto_id } = req.params;
        const result = await db.query(`
            SELECT 
                pr.id,
                pr.nombre_promocion,
                pr.producto_id,
                pr.nuevo_precio_venta,
                pr.activo,
                pr.fecha_inicio,
                pr.fecha_fin,
                pr.fecha_creado
            FROM public.promociones pr
            WHERE pr.producto_id = $1 AND pr.activo = true
            ORDER BY pr.fecha_creado DESC
        `, [producto_id]);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('❌ Error GET /promociones/producto/:id:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;