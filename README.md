InventoryPro 🍺 Cervecería Pro
Sistema web completo para la gestión de ventas por mesas y cuentas individuales en cervecerías y bares.

[

✨ Características Principales
Módulo	Descripción	Icono
📊 Dashboard	Vista general con métricas de ventas, mesas activas y ganancias	📈
📦 Productos	Gestión completa de inventario (cervezas, snacks, bebidas)	🗃️
🪑 Mesas	Control de pedidos por mesa con estados (ocupada/libre/pagada)	🍻
🛒 Compras	Registro de nuevas compras al proveedor y stock automático	📥
📋 Historial	Historial completo de ventas, consumos y movimientos	📜
💰 Cuentas	Cuentas individuales por cliente con deudas y pagos	💳
🛠️ Tecnologías
bash
Frontend: React 18 + React Router + Tailwind CSS 3.4
Backend: Supabase (PostgreSQL + Auth + Storage)
Despliegue: Vercel
Responsive: 100% Mobile-First (breakpoints personalizados)
🚀 Instalación Rápida
1. Clonar Repositorio
bash
git clone https://github.com/tu-usuario/inventorypro-cerveceria.git
cd inventorypro-cerveceria
2. Instalar Dependencias
bash
npm install
# o
yarn install
3. Configurar Supabase
bash
# 1. Crea proyecto en https://supabase.com
# 2. Crea archivo .env.local
cp .env.example .env.local
.env.local

text
VITE_SUPABASE_URL=tu_url_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key
4. Base de Datos (SQL)
sql
-- Ejecutar en Supabase SQL Editor
-- Tablas: productos, mesas, ventas, cuentas, historial
-- Ver /database/schema.sql
5. Ejecutar
bash
npm run dev
# Abrir http://localhost:5173
📱 Diseño Responsive
Breakpoint	Comportamiento	Tamaño
Mobile	Menú hamburguesa	0px - 1104px
Desktop	Menú horizontal	1105px+
Tablets	Transición suave	768px - 1104px
Características UI:

✅ Gradientes modernos y animaciones suaves

✅ Breakpoint personalizado 1105px

✅ Dark/Light mode ready

✅ Icons emoji intuitivos

🗄️ Estructura Base de Datos
sql
-- Tablas principales
productos (id, nombre, precio, stock, categoria)
mesas (id, numero, estado, total, cliente)
ventas (id, mesa_id, producto_id, cantidad, fecha)
cuentas (id, cliente, deuda, ultimo_pago)
historial (id, tipo, monto, fecha, descripcion)
📊 Funcionalidades por Módulo
🪑 Mesas
text
Mesa 1 🟢 Libre    $0
Mesa 2 🟡 Ocupada  $12.50
Mesa 3 🔴 Pagada   $28.00
💰 Cuentas
text
Juan Pérez     $45.00 pendiente
María Gómez    $0.00 ✅ al día
Carlos López   $23.50 pendiente
🔧 Comandos Útiles
bash
npm run dev        # Desarrollo local
npm run build      # Build producción
npm run preview    # Preview build
npm run lint       # ESLint
npm run format     # Prettier
📈 Roadmap
 Dashboard con métricas

 Gestión de mesas

 Sistema de cuentas individuales

 Historial completo

 Impresora de tickets

 Notificaciones WebSocket

 App móvil PWA

 Integración WhatsApp

🤝 Contribuir
Fork el proyecto

Crear feature branch (git checkout -b feature/nueva-funcion)

Commit cambios (git commit -m 'feat: nueva función')

Push al branch (git push origin feature/nueva-funcion)

Abrir Pull Request

📄 Licencia
MIT License - Úsala, modifícala, ¡ponla en tu cervecería! 🍻

👨‍💻 Autor
Desarrollador Fullstack
🇸🇻 El Salvador
LinkedIn | GitHub

<div align="center"> <img src="https://via.placeholder.com/600x200/1e293b/ffffff?text=🍺+InventoryPro+-+Tu+cervecería+ordenada" alt="Banner"> </div> <p align="center"> <em>¡Gestiona tu cervecería como profesional! 🚀</em> </p>
⭐ Star si te sirvió | 🍺 Cerveza virtual apreciada | 📱 Demo: contáctame