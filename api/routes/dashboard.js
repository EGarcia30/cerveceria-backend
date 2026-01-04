// api/routes/dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// DASHBOARD - MÉTRICAS PRINCIPALES
// ============================================

// ✅ GET /api/dashboard - DATOS COMPLETOS Dashboard
// ✅ GET /api/dashboard?periodo=hoy - TZ El Salvador
router.get('/', async (req, res) => {
    try {
        const periodo = req.query.periodo || 'mes';
        
        // ✅ FECHA BASE El Salvador
        const fechaSV = new Date().toLocaleDateString('sv-SV', { 
            timeZone: 'America/El_Salvador',
            year: 'numeric', month: '2-digit', day: '2-digit' 
        }).split('/').reverse().join('-'); // "2026-01-02"
        
        let whereClause = '';
        
        // ✅ FILTROS usando fecha SV
        switch(periodo) {
            case 'hoy':
                whereClause = `DATE(c.fecha_creado) = '${fechaSV}'`;
                break;
            case 'ayer':
                const ayerSV = new Date(Date.now() - 86400000).toLocaleDateString('sv-SV', { 
                    timeZone: 'America/El_Salvador',
                    year: 'numeric', month: '2-digit', day: '2-digit' 
                }).split('/').reverse().join('-');
                whereClause = `DATE(c.fecha_creado) = '${ayerSV}'`;
                break;
            case 'semana':
                whereClause = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '7 days'`;
                break;
            case 'mes':
                whereClause = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '30 days'`;
                break;
            case 'año':
                whereClause = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '365 days'`;
                break;
            default:
                whereClause = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '30 days'`;
        }
        
        console.log('📅 Filtro SV:', periodo, whereClause);
        
        const [
            { rows: productos },
            { rows: ventasPeriodo },
            { rows: mesas },
            { rows: stockCritico },
            { rows: topProductos },
            { rows: gananciasPeriodo },
            { rows: cuentasPendientes }
        ] = await Promise.all([
            // Productos (sin cambio)
            db.query(`
                SELECT 
                    COUNT(*) as total_productos,
                    SUM(CASE WHEN activo=true THEN 1 ELSE 0 END) as activos,
                    SUM(CASE WHEN cantidad_disponible <= cantidad_minima AND activo=true THEN 1 ELSE 0 END) as stock_critico
                FROM public.productos
            `),
            
            // Ventas PERIODO SV
            db.query(`
                SELECT 
                    COUNT(DISTINCT c.id) as ventas_periodo,
                    COALESCE(SUM(cd.precio_venta * cd.cantidad_vendida), 0) as ingresos_periodo
                FROM public.cuentas c
                JOIN public.cuentas_detalle cd ON c.id = cd.cuenta_id
                WHERE c.estado = 'pagado' AND ${whereClause}
            `),
            
            // Mesas (sin cambio)
            db.query(`
                SELECT 
                    COUNT(*) as mesas_total,
                    SUM(CASE WHEN estado='ocupada' THEN 1 ELSE 0 END) as mesas_ocupadas
                FROM public.mesas
            `),
            
            // Stock crítico (sin cambio)
            db.query(`
                SELECT COUNT(*) as count 
                FROM public.productos 
                WHERE cantidad_disponible <= cantidad_minima AND activo = true
            `),
            
            // Top productos PERIODO SV
            db.query(`
                SELECT 
                    p.descripcion, p.presentacion,
                    COALESCE(SUM(cd.cantidad_vendida), 0) as total_vendido,
                    COALESCE(SUM(cd.precio_venta * cd.cantidad_vendida), 0) as ingresos
                FROM public.productos p
                LEFT JOIN public.cuentas_detalle cd ON p.id = cd.producto_id
                LEFT JOIN public.cuentas c ON cd.cuenta_id = c.id AND c.estado = 'pagado'
                WHERE ${whereClause} OR c.id IS NULL
                GROUP BY p.id, p.descripcion, p.presentacion
                ORDER BY total_vendido DESC NULLS LAST
                LIMIT 5
            `),
            
            // Ganancias PERIODO SV
            db.query(`
                SELECT 
                    COALESCE(SUM(cd.precio_venta * cd.cantidad_vendida), 0) as ingresos,
                    COALESCE(SUM(cd.precio_compra_actual * cd.cantidad_vendida), 0) as costos,
                    (COALESCE(SUM(cd.precio_venta * cd.cantidad_vendida), 0) - 
                     COALESCE(SUM(cd.precio_compra_actual * cd.cantidad_vendida), 0)) as ganancia
                FROM public.cuentas c
                JOIN public.cuentas_detalle cd ON c.id = cd.cuenta_id
                WHERE c.estado = 'pagado' AND ${whereClause}
            `),
            
            // Cuentas pendientes (sin cambio)
            db.query(`
                SELECT COUNT(*) as pendientes 
                FROM public.cuentas 
                WHERE estado = 'pendiente'
            `)
        ]);

        res.json({
            success: true,
            periodo,
            fechaBaseSV: fechaSV, // ✅ Debug
            data: {
                productos: productos[0],
                ventasPeriodo: ventasPeriodo[0],
                mesas: mesas[0],
                stockCritico: stockCritico[0].count,
                topProductos: topProductos,
                ganancias: gananciasPeriodo[0],
                cuentasPendientes: cuentasPendientes[0]
            }
        });

    } catch (error) {
        console.error('Error dashboard SV:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GET /api/dashboard/productos - Productos con stock crítico
router.get('/productos', async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT 
                id, descripcion, presentacion, proveedor,
                cantidad_disponible, cantidad_minima, cantidad_maxima,
                precio_venta,
                CASE 
                    WHEN cantidad_disponible <= cantidad_minima THEN 'danger'
                    WHEN cantidad_disponible <= (cantidad_minima * 2) THEN 'warning'
                    ELSE 'success'
                END as status
            FROM public.productos 
            WHERE activo = true 
            ORDER BY 
                CASE 
                    WHEN cantidad_disponible <= cantidad_minima THEN 1
                    WHEN cantidad_disponible <= (cantidad_minima * 2) THEN 2
                    ELSE 3 
                END,
                cantidad_disponible ASC
            LIMIT 8
        `);

        res.json({
            success: true,
            data: rows
        });

    } catch (error) {
        console.error('Error productos dashboard:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ✅ GET /api/dashboard/ventas - Ventas recientes
router.get('/ventas', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const countQuery = `
            SELECT COUNT(DISTINCT c.id) as total 
            FROM public.cuentas c
            LEFT JOIN public.cuentas_detalle cd ON c.id = cd.cuenta_id
            WHERE c.fecha_creado >= CURRENT_DATE - INTERVAL '7 days'
        `;

        const ventasQuery = `
            SELECT 
                c.id, c.cliente, c.total, c.estado, c.tipo_cuenta,
                COUNT(cd.id) as items,
                c.fecha_creado,
                COALESCE(SUM(cd.precio_venta * cd.cantidad_vendida), 0) as subtotal
            FROM public.cuentas c
            LEFT JOIN public.cuentas_detalle cd ON c.id = cd.cuenta_id
            WHERE c.fecha_creado >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY c.id, c.cliente, c.total, c.estado, c.tipo_cuenta, c.fecha_creado
            ORDER BY c.fecha_creado DESC
            LIMIT $1 OFFSET $2
        `;

        const [countResult, ventasResult] = await Promise.all([
            db.query(countQuery),
            db.query(ventasQuery, [limit, offset])
        ]);

        const totalItems = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            success: true,
            data: ventasResult.rows,
            pagination: {
                page, limit, totalItems, totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Error ventas dashboard:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
