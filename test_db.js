const { query } = require('./server/config/database');

async function test() {
    try {
        await query(
            `INSERT INTO invoices
                 (invoice_number, total_amount, tax_amount, status, payload_json)
             VALUES ($1, $2, $3, 'draft', $4) RETURNING id`,
            ['TEST', 0, 0, JSON.stringify({})]
        );
        console.log('Success!');
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
test();
