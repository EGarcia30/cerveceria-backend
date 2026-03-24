const express = require("express");
const router = express.Router();
const db = require("../config/database");

// ✅ GET /api/forma_pago - Listar todas las formas de pago
router.get("/", async (req, res) => {
    try {
        const formas = await db.query(
            `SELECT id, codigo, nombre, descripcion, activo 
             FROM public.forma_pago 
             WHERE activo = true 
             ORDER BY codigo`
        );

        res.json({
            success: true,
            data: formas.rows
        });
    } catch (error) {
        console.error("🚨 ERROR GET forma_pago:", error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;
