// api/routes/categorias.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/categorias - Lista todas las categorías activas
router.get('/', async (req, res) => {
    try {
        const query = `
        SELECT 
            id,
            nombre,
            codigo,
            descripcion,
            activo
        FROM public.categorias 
        WHERE activo = true
        ORDER BY nombre ASC
        `;

        const result = await db.query(query);

        res.json({
            success: true,
            count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error('Error al obtener categorías:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor',
            error: error.message
        });
    }
});

module.exports = router;