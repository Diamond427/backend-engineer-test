import Fastify from 'fastify';
import { Pool } from 'pg';
import { createHash } from 'crypto';

const fastify = Fastify({ logger: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create required tables if they don't exist
async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      height INTEGER UNIQUE NOT NULL,
      block_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      block_id TEXT REFERENCES blocks(id),
      input_sum INTEGER NOT NULL,
      output_sum INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS balances (
      address TEXT PRIMARY KEY,
      balance INTEGER NOT NULL
    );
  `);
}

// Endpoint to process blocks
fastify.post('/blocks', async (request, reply) => {
  const block = request.body as any; // Replace with appropriate type

  try {
    // Validate block height
    const { rows } = await pool.query('SELECT MAX(height) as height FROM blocks');
    const currentHeight = rows[0]?.height || 0;
    if (block.height !== currentHeight + 1) {
      return reply.status(400).send({ error: 'Block height is not sequential' });
    }

    // Validate input/output sum
    const inputSum = block.transactions.flatMap(tx => tx.inputs).length;
    const outputSum = block.transactions.flatMap(tx => tx.outputs).reduce((acc, output) => acc + output.value, 0);
    if (inputSum !== outputSum) {
      return reply.status(400).send({ error: 'Input sum does not match output sum' });
    }

    // Validate block ID
    const transactionIds = block.transactions.map(tx => tx.id).join('');
    const expectedBlockId = createHash('sha256').update(`${block.height}${transactionIds}`).digest('hex');
    if (block.id !== expectedBlockId) {
      return reply.status(400).send({ error: 'Block ID is invalid' });
    }

    // Insert the block into the database
    await pool.query('INSERT INTO blocks (id, height, block_hash) VALUES ($1, $2, $3)', [block.id, block.height, block.id]);

    // Update balances based on transactions
    for (const tx of block.transactions) {
      for (const input of tx.inputs) {
        // Deduct value from address (inputs)
        await pool.query(
          'UPDATE balances SET balance = balance - $1 WHERE address = $2',
          [input.value, input.address]
        );
      }

      for (const output of tx.outputs) {
        // Credit value to address (outputs)
        await pool.query(
          'INSERT INTO balances (address, balance) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET balance = balances.balance + $2',
          [output.address, output.value]
        );
      }
    }

    return reply.status(200).send({ message: 'Block processed successfully' });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
});

// Endpoint to get balance of an address
fastify.get('/balance/:address', async (request, reply) => {
  const { address } = request.params as any;

  try {
    const { rows } = await pool.query('SELECT balance FROM balances WHERE address = $1', [address]);
    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Address not found' });
    }

    return reply.status(200).send({ balance: rows[0].balance });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
});

// Endpoint to rollback to a specific block height
fastify.post('/rollback', async (request, reply) => {
  const { height } = request.query as any;

  try {
    // Rollback transactions
    await pool.query('DELETE FROM transactions WHERE block_id IN (SELECT id FROM blocks WHERE height > $1)', [height]);
    await pool.query('DELETE FROM blocks WHERE height > $1', [height]);

    // Recalculate balances
    await recalculateBalances();

    return reply.status(200).send({ message: 'Rollback successful' });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
});

// Recalculate balances from scratch (simplified)
async function recalculateBalances() {
  const { rows } = await pool.query('SELECT * FROM transactions');

  const balances: Record<string, number> = {};

  rows.forEach((tx: any) => {
    tx.outputs.forEach((output: any) => {
      balances[output.address] = (balances[output.address] || 0) + output.value;
    });

    tx.inputs.forEach((input: any) => {
      balances[input.address] = (balances[input.address] || 0) - input.value;
    });
  });

  await pool.query('DELETE FROM balances');
  for (const [address, balance] of Object.entries(balances)) {
    await pool.query('INSERT INTO balances (address, balance) VALUES ($1, $2)', [address, balance]);
  }
}

const start = async () => {
  try {
    await createTables();
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
