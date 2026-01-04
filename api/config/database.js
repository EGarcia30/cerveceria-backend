const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: {
    rejectUnauthorized: false // Necesario para Supabase
}
});

// Verificar conexión al iniciar
pool.on('connect', () => {
    console.log('🟢 Conectado a PostgreSQL (Supabase)');
});

pool.on('error', (err) => {
    console.error('🔴 Error de conexión PostgreSQL:', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool // Exportar pool para transacciones en rutas
};
