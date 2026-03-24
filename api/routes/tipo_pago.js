const express = require("express");
const router = express.Router();
const db = require("../config/database");

// ✅ GET /api/tipo_pago - Listar todos los tipos de pago
router.get("/", async (req, res) => {
    try {
        const tipos = await db.query(
            `SELECT id, codigo, nombre, descripcion 
             FROM public.tipo_pago 
             ORDER BY codigo`
        );

        res.json({
            success: true,
            data: tipos.rows
        });
    } catch (error) {
        console.error("🚨 ERROR GET tipo_pago:", error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;
