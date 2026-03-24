// api/routes/dashboard.js - COMPLETO ✅ TURNO 17:00→06:00 CRUZADO
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// DASHBOARD - MÉTRICAS + GASTOS OPERATIVOS
// ============================================

// ✅ GET /api/dashboard/productos - Stock crítico
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GET /api/dashboard/ventas - Ventas recientes
router.get('/ventas', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filtro = req.query.filtro || 'ultimas';

        let whereClause = '';
        
        // 🌙 TZ EL SALVADOR
        function getFechaSV() {
            const now = new Date().toLocaleString('sv-SV', { 
                timeZone: 'America/El_Salvador',
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit' 
            });
            return now.split('/').reverse().join('-'); // YYYY-MM-DD ✅
        }

        function getHoraSV() {
            return new Date().toLocaleString('sv-SV', { 
                timeZone: 'America/El_Salvador', 
                hour: 'numeric', 
                hour12: false 
            }).split(':')[0] || '0'; // Solo horas, fallback
        }

        const fechaSV = getFechaSV();
        const horaSV = parseInt(getHoraSV())
                
        switch(filtro) {
            case 'turno':
                if (horaSV >= 17) {
                    whereClause = `c.fecha_creado >= '${fechaSV} 17:00:00'`;
                } else {
                    const ayerSV = new Date(Date.now() - 86400000).toLocaleDateString('sv-SV', { 
                        timeZone: 'America/El_Salvador', 
                        year: 'numeric', month: '2-digit', day: '2-digit' 
                    }).split('/').reverse().join('-');
                    whereClause = `(c.fecha_creado >= '${ayerSV} 17:00:00' AND c.fecha_creado < '${fechaSV} 06:00:00')`;
                }
                break;
            case 'hoy':
                whereClause = `DATE(c.fecha_creado) = '${fechaSV}'`;
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
                whereClause = `c.fecha_creado >= CURRENT_DATE - INTERVAL '7 days'`;
        }

        const countQuery = `
            SELECT COUNT(DISTINCT c.id) as total 
            FROM public.cuentas c
            LEFT JOIN public.cuentas_detalle cd ON c.id = cd.cuenta_id
            WHERE ${whereClause}
        `;

        const ventasQuery = `
            SELECT 
                c.id, c.cliente, c.total, c.estado, c.tipo_cuenta,
                COUNT(cd.id) as items,
                c.fecha_creado
            FROM public.cuentas c
            LEFT JOIN public.cuentas_detalle cd ON c.id = cd.cuenta_id
            WHERE ${whereClause}
            GROUP BY c.id, c.cliente, c.total, c.estado, c.tipo_cuenta, c.fecha_creado
            ORDER BY c.fecha_creado DESC
            LIMIT $1 OFFSET $2
        `;

        const [countResult, ventasResult] = await Promise.all([
            db.query(countQuery),
            db.query(ventasQuery, [limit, offset])
        ]);

        res.json({
            success: true,
            filtro,
            data: ventasResult.rows,
            pagination: {
                page, limit, 
                totalItems: parseInt(countResult.rows[0].total),
                totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
            }
        });

    } catch (error) {
        console.error('Error ventas dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GET /api/dashboard/ - Dashboard PRINCIPAL ✅ TURNO CRUZADO
router.get('/', async (req, res) => {
    try {
        const filtro = req.query.filtro || 'turno';
        
        // 🌙 TZ EL SALVADOR
        function getFechaSV() {
            const now = new Date().toLocaleString('sv-SV', { 
                timeZone: 'America/El_Salvador',
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit' 
            });
            return now.split('/').reverse().join('-'); // YYYY-MM-DD ✅
        }

        function getHoraSV() {
            return new Date().toLocaleString('sv-SV', { 
                timeZone: 'America/El_Salvador', 
                hour: 'numeric', 
                hour12: false 
            }).split(':')[0] || '0'; // Solo horas, fallback
        }

        const fechaSV = getFechaSV();
        const horaSV = parseInt(getHoraSV())

        let whereClauseVentas = '';
        let whereClauseGastos = '';

        // ✅ TURNO COMPLETO 17:00→06:00 (CRUZADO)
        switch(filtro) {
            case 'turno':
                if (horaSV >= 17) {
                    // 🌙 TURNO NOCHE: 17:00 HOY → 06:00 MAÑANA
                    whereClauseVentas = `c.fecha_creado >= '${fechaSV} 17:00:00'`;
                    whereClauseGastos = `go.fecha_creado >= '${fechaSV} 17:00:00'`;
                } else {
                    // 🌙 TURNO NOCHE 00:00-05:59: AYER 17:00 → HOY 06:00
                    const ayerSV = new Date(Date.now() - 86400000).toLocaleDateString('sv-SV', { 
                        timeZone: 'America/El_Salvador', 
                        year: 'numeric', month: '2-digit', day: '2-digit' 
                    }).split('/').reverse().join('-');
                    
                    whereClauseVentas = `(c.fecha_creado >= '${ayerSV} 17:00:00' AND c.fecha_creado < '${fechaSV} 06:00:00')`;
                    whereClauseGastos = `(go.fecha_creado >= '${ayerSV} 17:00:00' AND go.fecha_creado < '${fechaSV} 06:00:00')`;
                }
                break;
                
            case 'hoy':
                whereClauseVentas = `DATE(c.fecha_creado) = '${fechaSV}'`;
                whereClauseGastos = `DATE(go.fecha_creado) = '${fechaSV}'`;
                break;
                
            case 'semana':
                whereClauseVentas = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '7 days'`;
                whereClauseGastos = `DATE(go.fecha_creado) >= '${fechaSV}'::date - INTERVAL '7 days'`;
                break;
                
            case 'mes':
                whereClauseVentas = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '30 days'`;
                whereClauseGastos = `DATE(go.fecha_creado) >= '${fechaSV}'::date - INTERVAL '30 days'`;
                break;
                
            case 'año':
                whereClauseVentas = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '365 days'`;
                whereClauseGastos = `DATE(go.fecha_creado) >= '${fechaSV}'::date - INTERVAL '365 days'`;
                break;
        }

        // 🔍 DEBUG TURNO
        console.log('🔍 DEBUG:', {
            filtro, 
            fechaSV, 
            horaSV,
            ayerSV: filtro === 'turno' && horaSV < 18 ? 'CALCULADO' : 'N/A',
            whereClauseGastos,
            'turno_completo': '18:00→06:00'
        });

        const queries = [
            // 1. Productos totales
            db.query(`
                SELECT 
                    COUNT(*) as total_productos,
                    SUM(CASE WHEN activo=true THEN 1 ELSE 0 END) as activos
                FROM public.productos
            `),
            
            // 2. Ventas PERIODO (solo pagadas)
            db.query(`
                SELECT 
                    COUNT(DISTINCT c.id) as ventas_periodo,
                    COALESCE(SUM(cd.precio_venta * cd.cantidad_vendida), 0) as ingresos_periodo
                FROM public.cuentas c
                JOIN public.cuentas_detalle cd ON c.id = cd.cuenta_id
                WHERE c.estado = 'pagado' AND ${whereClauseVentas}
            `),
            
            // 3. GASTOS OPERATIVOS (solo aprobados)
            db.query(`
                SELECT 
                    COALESCE(SUM(go.total), 0) as gastos_operativos,
                    COUNT(go.id) as total_gastos
                FROM public.gastos_operativos go
                WHERE go.estado = 'aprobado' AND ${whereClauseGastos}
            `),
            
            // 4. Stock crítico
            db.query(`
                SELECT COUNT(*) as count 
                FROM public.productos 
                WHERE cantidad_disponible <= cantidad_minima AND activo = true
            `),
            
            // 5. Top productos
            db.query(`
                SELECT 
                    p.descripcion, p.presentacion,
                    COALESCE(SUM(cd.cantidad_vendida), 0) as total_vendido,
                    COALESCE(SUM(cd.precio_venta * cd.cantidad_vendida), 0) as ingresos
                FROM public.productos p
                LEFT JOIN public.cuentas_detalle cd ON p.id = cd.producto_id
                LEFT JOIN public.cuentas c ON cd.cuenta_id = c.id AND c.estado = 'pagado' AND ${whereClauseVentas}
                GROUP BY p.id, p.descripcion, p.presentacion
                ORDER BY total_vendido DESC NULLS LAST
                LIMIT 6
            `),
            
            // 6. Costos productos
            db.query(`
                SELECT 
                    COALESCE(SUM(cd.precio_compra_actual * cd.cantidad_vendida), 0) as costos
                FROM public.cuentas c
                JOIN public.cuentas_detalle cd ON c.id = cd.cuenta_id
                WHERE c.estado = 'pagado' AND ${whereClauseVentas}
            `)
        ];

        const [
            { rows: productos },
            { rows: ventasPeriodo },
            { rows: gastosOperativos },
            { rows: stockCritico },
            { rows: topProductos },
            { rows: costosProd }
        ] = await Promise.all(queries);

        // ✅ GANANCIA PRODUCTOS
        const gananciaProductos = (ventasPeriodo[0]?.ingresos_periodo || 0) - (costosProd[0]?.costos || 0);

        res.json({
            success: true,
            filtro,
            fechaSV,
            horaSV: horaSV,
            data: {
                productos: productos[0],
                ventasPeriodo: ventasPeriodo[0],
                gastosOperativos: gastosOperativos[0],
                stockCritico: parseInt(stockCritico[0].count),
                topProductos: topProductos,
                ganancias: {
                    costos: parseFloat(costosProd[0]?.costos || 0),
                    ganancia: gananciaProductos
                }
            }
        });

    } catch (error) {
        console.error('Error dashboard SV:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🆕 api/routes/dashboard.js - AGREGAR FORMAS PAGO + VUELTO
// Agregar estas 2 rutas NUEVAS al final del archivo:

// ✅ GET /api/dashboard/formas-pago - Ventas por forma de pago
router.get('/formas-pago', async (req, res) => {
    try {
        const filtro = req.query.filtro || 'turno';
        
        // Reutilizar lógica de fechas del dashboard principal
        function getFechaSV() {
            const now = new Date().toLocaleString('sv-SV', { 
                timeZone: 'America/El_Salvador',
                year: 'numeric', month: '2-digit', day: '2-digit' 
            });
            return now.split('/').reverse().join('-');
        }

        function getHoraSV() {
            return new Date().toLocaleString('sv-SV', { 
                timeZone: 'America/El_Salvador', 
                hour: 'numeric', hour12: false 
            }).split(':')[0] || '0';
        }

        const fechaSV = getFechaSV();
        const horaSV = parseInt(getHoraSV());
        let whereClause = '';

        // ✅ MISMA LÓGICA DE FILTROS
        switch(filtro) {
            case 'turno':
                if (horaSV >= 17) {
                    whereClause = `a.fecha_pago >= '${fechaSV} 17:00:00'`;
                } else {
                    const ayerSV = new Date(Date.now() - 86400000).toLocaleDateString('sv-SV', { 
                        timeZone: 'America/El_Salvador', 
                        year: 'numeric', month: '2-digit', day: '2-digit' 
                    }).split('/').reverse().join('-');
                    whereClause = `(a.fecha_pago >= '${ayerSV} 17:00:00' AND a.fecha_pago < '${fechaSV} 06:00:00')`;
                }
                break;
            case 'hoy': whereClause = `DATE(a.fecha_pago) = '${fechaSV}'`; break;
            case 'semana': whereClause = `DATE(a.fecha_pago) >= '${fechaSV}'::date - INTERVAL '7 days'`; break;
            case 'mes': whereClause = `DATE(a.fecha_pago) >= '${fechaSV}'::date - INTERVAL '30 days'`; break;
            case 'año': whereClause = `DATE(a.fecha_pago) >= '${fechaSV}'::date - INTERVAL '365 days'`; break;
        }

        const formasPagoQuery = `
            SELECT 
                fp.codigo,
                fp.nombre,
                COALESCE(SUM(a.total_abonado), 0) as total_ventas,
                COUNT(a.id) as total_transacciones
            FROM public.abonos_cuenta a
            JOIN public.forma_pago fp ON a.forma_pago_id = fp.id
            WHERE ${whereClause}
            GROUP BY fp.id, fp.codigo, fp.nombre
            ORDER BY total_ventas DESC
        `;

        const { rows: formasPago } = await db.query(formasPagoQuery);
        const totalGeneral = formasPago.reduce((sum, fp) => sum + parseFloat(fp.total_ventas), 0);

        res.json({
            success: true,
            filtro,
            data: formasPago.map(fp => ({
                ...fp,
                total_ventas: parseFloat(fp.total_ventas),
                porcentaje: totalGeneral > 0 ? ((parseFloat(fp.total_ventas) / totalGeneral) * 100).toFixed(1) : 0
            }))
        });

    } catch (error) {
        console.error('Error formas-pago dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ GET /api/dashboard/vuelto - Total vuelto por período
router.get('/vuelto', async (req, res) => {
    try {
        const filtro = req.query.filtro || 'turno';
        
        // Reutilizar misma lógica de fechas
        function getFechaSV() {
            const now = new Date().toLocaleString('sv-SV', { 
                timeZone: 'America/El_Salvador',
                year: 'numeric', month: '2-digit', day: '2-digit' 
            });
            return now.split('/').reverse().join('-');
        }

        function getHoraSV() {
            return new Date().toLocaleString('sv-SV', { 
                timeZone: 'America/El_Salvador', 
                hour: 'numeric', hour12: false 
            }).split(':')[0] || '0';
        }

        const fechaSV = getFechaSV();
        const horaSV = parseInt(getHoraSV());
        let whereClause = '';

        switch(filtro) {
            case 'turno':
                if (horaSV >= 17) {
                    whereClause = `c.fecha_creado >= '${fechaSV} 17:00:00'`;
                } else {
                    const ayerSV = new Date(Date.now() - 86400000).toLocaleDateString('sv-SV', { 
                        timeZone: 'America/El_Salvador', 
                        year: 'numeric', month: '2-digit', day: '2-digit' 
                    }).split('/').reverse().join('-');
                    whereClause = `(c.fecha_creado >= '${ayerSV} 17:00:00' AND c.fecha_creado < '${fechaSV} 06:00:00')`;
                }
                break;
            case 'hoy': whereClause = `DATE(c.fecha_creado) = '${fechaSV}'`; break;
            case 'semana': whereClause = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '7 days'`; break;
            case 'mes': whereClause = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '30 days'`; break;
            case 'año': whereClause = `DATE(c.fecha_creado) >= '${fechaSV}'::date - INTERVAL '365 days'`; break;
        }

        const vueltoQuery = `
            SELECT 
                COALESCE(SUM(c.total_vuelto), 0) as total_vuelto,
                COUNT(CASE WHEN c.total_vuelto > 0 THEN 1 END) as transacciones_con_vuelto
            FROM public.cuentas c
            WHERE c.estado = 'pagado' AND ${whereClause} AND c.total_vuelto > 0
        `;

        const { rows: vueltoData } = await db.query(vueltoQuery);

        res.json({
            success: true,
            filtro,
            data: {
                total_vuelto: parseFloat(vueltoData[0].total_vuelto),
                transacciones_con_vuelto: parseInt(vueltoData[0].transacciones_con_vuelto)
            }
        });

    } catch (error) {
        console.error('Error vuelto dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;