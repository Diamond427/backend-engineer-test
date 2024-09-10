import { expect } from 'chai';
import { describe, it, before } from 'mocha'; // Adjust if using Bun test runner
import axios from 'axios';

// Set the base URL for your API
const BASE_URL = 'http://localhost:3000';

describe('EMURGO Backend Engineer Challenge API Tests', () => {
  // This block runs before any tests to reset the environment
  before(async () => {
    // Ensure the environment is clean before running tests
    await axios.post(`${BASE_URL}/rollback`, { height: 0 });
  });

  it('should process a valid block with no previous blocks', async () => {
    const block = {
      id: 'b1d1c5b8c4ed1e7d3b88c63e09b9f8d2e4312db2b7c8f6b6d5c4e2e8c8b9f7d4', // Example SHA256 hash of the block
      height: 1,
      transactions: [
        {
          id: 'tx1',
          inputs: [],
          outputs: [
            { address: 'addr1', value: 10 },
            { address: 'addr2', value: 5 }
          ]
        }
      ]
    };

    const response = await axios.post(`${BASE_URL}/blocks`, block);
    expect(response.status).to.equal(200);
    expect(response.data.message).to.equal('Block processed successfully');
  });

  it('should update balances correctly after processing a block', async () => {
    const addr1Response = await axios.get(`${BASE_URL}/balance/addr1`);
    const addr2Response = await axios.get(`${BASE_URL}/balance/addr2`);

    expect(addr1Response.status).to.equal(200);
    expect(addr1Response.data.balance).to.equal(10);

    expect(addr2Response.status).to.equal(200);
    expect(addr2Response.data.balance).to.equal(5);
  });

  it('should process a new block with valid inputs referencing previous outputs', async () => {
    const block = {
      id: 'd4b8f2e8c5b6e4d8c7e2f1b8c5d8e7f9e4c3b2a1c5e8f2d3b6c4d2e8f7b9a8d3', // Example SHA256 hash of the block
      height: 2,
      transactions: [
        {
          id: 'tx2',
          inputs: [{ txId: 'tx1', index: 0 }], // Spending from addr1
          outputs: [
            { address: 'addr3', value: 6 },
            { address: 'addr4', value: 4 }
          ]
        }
      ]
    };

    const response = await axios.post(`${BASE_URL}/blocks`, block);
    expect(response.status).to.equal(200);
    expect(response.data.message).to.equal('Block processed successfully');
  });

  it('should update balances correctly after processing another block', async () => {
    const addr1Response = await axios.get(`${BASE_URL}/balance/addr1`);
    const addr3Response = await axios.get(`${BASE_URL}/balance/addr3`);
    const addr4Response = await axios.get(`${BASE_URL}/balance/addr4`);

    expect(addr1Response.status).to.equal(200);
    expect(addr1Response.data.balance).to.equal(0); // addr1 spent its balance

    expect(addr3Response.status).to.equal(200);
    expect(addr3Response.data.balance).to.equal(6);

    expect(addr4Response.status).to.equal(200);
    expect(addr4Response.data.balance).to.equal(4);
  });

  it('should rollback to a previous block height correctly', async () => {
    const rollbackResponse = await axios.post(`${BASE_URL}/rollback?height=1`);
    expect(rollbackResponse.status).to.equal(200);
    expect(rollbackResponse.data.message).to.equal('Rollback successful');

    const addr1Response = await axios.get(`${BASE_URL}/balance/addr1`);
    const addr3Response = await axios.get(`${BASE_URL}/balance/addr3`);
    const addr4Response = await axios.get(`${BASE_URL}/balance/addr4`);

    expect(addr1Response.status).to.equal(200);
    expect(addr1Response.data.balance).to.equal(10); // addr1 balance restored

    expect(addr3Response.status).to.equal(404); // addr3 should not exist
    expect(addr4Response.status).to.equal(404); // addr4 should not exist
  });

  it('should return 400 if block height is not sequential', async () => {
    const block = {
      id: 'invalidblock',
      height: 3, // Invalid as the current height is 2 after rollback
      transactions: [
        {
          id: 'tx_invalid',
          inputs: [],
          outputs: [{ address: 'addr5', value: 5 }]
        }
      ]
    };

    try {
      await axios.post(`${BASE_URL}/blocks`, block);
    } catch (error: any) {
      expect(error.response.status).to.equal(400);
      expect(error.response.data.error).to.equal('Block height is not sequential');
    }
  });

  it('should return 400 if input and output sums do not match', async () => {
    const block = {
      id: 'b1invalid',
      height: 2,
      transactions: [
        {
          id: 'tx_invalid2',
          inputs: [{ txId: 'tx1', index: 0 }],
          outputs: [{ address: 'addr6', value: 15 }] // Exceeds input sum
        }
      ]
    };

    try {
      await axios.post(`${BASE_URL}/blocks`, block);
    } catch (error: any) {
      expect(error.response.status).to.equal(400);
      expect(error.response.data.error).to.equal('Input sum does not match output sum');
    }
  });

  it('should return 400 if block ID is invalid', async () => {
    const block = {
      id: 'invalid_id', // Invalid block ID not matching the SHA256 calculation
      height: 2,
      transactions: [
        {
          id: 'tx3',
          inputs: [],
          outputs: [{ address: 'addr7', value: 8 }]
        }
      ]
    };

    try {
      await axios.post(`${BASE_URL}/blocks`, block);
    } catch (error: any) {
      expect(error.response.status).to.equal(400);
      expect(error.response.data.error).to.equal('Block ID is invalid');
    }
  });
});
