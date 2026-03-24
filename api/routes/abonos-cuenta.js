const express = require("express");
const router = express.Router();
const db = require("../config/database");

// ✅ POST /abonos-cuenta - sin tipo_pago
router.post("/", async (req, res) => {
  const { cuenta_id, total_abonado, forma_pago_id, referencia, nota } = req.body;

  if (!cuenta_id || !total_abonado || !forma_pago_id) {
    return res.status(400).json({ success: false, error: "Faltan campos requeridos" });
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Bloquear cuenta
    const cuenta = await client.query(
      `SELECT id, total, estado, tipo_pago FROM public.cuentas WHERE id = $1 FOR UPDATE`,
      [cuenta_id]
    );

    if (cuenta.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "Cuenta no encontrada" });
    }

    if (cuenta.rows[0].estado === "pagado") {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "La cuenta ya está pagada" });
    }

    // 2. Validar forma_pago
    const formaPago = await client.query(
      "SELECT id FROM public.forma_pago WHERE id = $1",
      [forma_pago_id]
    );

    if (formaPago.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, error: "Forma de pago inválida" });
    }

    // 3. Insertar abono (sin tipo_pago_id)
    const abono = await client.query(
      `INSERT INTO public.abonos_cuenta (
          cuenta_id,
          total_abonado,
          forma_pago_id,
          referencia,
          nota
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, cuenta_id, total_abonado`,
      [cuenta_id, total_abonado, forma_pago_id, referencia, nota]
    );

    // ✅ 4. Actualizar tabla cuentas (como ya tenías)
    const cuentaActualizada = await client.query(
      `UPDATE public.cuentas
       SET
         total_pagado = COALESCE((
           SELECT SUM(total_abonado)
           FROM public.abonos_cuenta
           WHERE cuenta_id = $1
         ), 0),
         total_pendiente = GREATEST($2::numeric - COALESCE((
           SELECT SUM(total_abonado)
           FROM public.abonos_cuenta
           WHERE cuenta_id = $1
         ), 0), 0),
         total_vuelto = GREATEST(COALESCE((
           SELECT SUM(total_abonado)
           FROM public.abonos_cuenta
           WHERE cuenta_id = $1
         ), 0) - $2::numeric, 0),
         estado = CASE
           WHEN $2::numeric <= COALESCE((
                 SELECT SUM(total_abonado)
                 FROM public.abonos_cuenta
                 WHERE cuenta_id = $1
               ), 0) THEN 'pagado'
           ELSE 'pendiente'
         END
       WHERE id = $1
       RETURNING id, cliente, total, total_pagado, total_pendiente, total_vuelto, estado`,
      [cuenta_id, cuenta.rows[0].total]
    );

    await client.query("COMMIT");

    const cuentaData = cuentaActualizada.rows[0];

    res.json({
      success: true,
      data: {
        abono: abono.rows[0],
        cuenta: {
          id: parseInt(cuentaData.id),
          cliente: cuentaData.cliente,
          total: parseFloat(cuentaData.total),
          total_pagado: parseFloat(cuentaData.total_pagado),
          total_pendiente: parseFloat(cuentaData.total_pendiente),
          total_vuelto: parseFloat(cuentaData.total_vuelto),
          estado: cuentaData.estado,
          tipo_pago: cuentaData.tipo_pago // ✅ lo puedes devolver si quieres
        }
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ ERROR:", error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ✅ GET /api/abonos-cuenta/cuenta/:cuenta_id - Listar abonos de una cuenta
router.get("/cuenta/:cuenta_id", async (req, res) => {
  const { cuenta_id } = req.params;

  try {
    const abonos = await db.query(
      `SELECT
          a.id,
          a.total_abonado,
          a.forma_pago_id,
          a.referencia,
          a.nota,
          a.fecha_pago,
          fp.codigo as forma_pago_codigo,
          fp.nombre as forma_pago_nombre
       FROM public.abonos_cuenta a
       JOIN public.forma_pago fp ON a.forma_pago_id = fp.id
       WHERE a.cuenta_id = $1
       ORDER BY a.fecha_pago DESC`,
      [cuenta_id]
    );

    res.json({
      success: true,
      data: abonos.rows,
    });
  } catch (error) {
    console.error("🚨 ERROR GET abonos cuenta:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


module.exports = router;
