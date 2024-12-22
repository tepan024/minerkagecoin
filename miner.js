const axios = require('axios');
const crypto = require('crypto');
const winston = require('winston');
const { combine, timestamp, printf, colorize } = winston.format; // Import colorize from winston.format

// Fetch miner address from command line argument
const minerAddress = process.argv[2]; // Miner address passed as the first argument
if (!minerAddress) {
    console.error('❌ Please provide a miner address as the first argument!');
    process.exit(1); // Exit the script if no address is provided
}

// API URL for mining
const API_URL_MINE = 'http://localhost:3000/mine';

// Difficulty target (representing the number of leading zeros in the hash)
let difficulty = 4; // Starting difficulty, can adjust based on block times or halvings

// Number of parallel mining threads (tasks)
const parallelThreads = 4;

// Create a custom log format
const logFormat = combine(
    colorize(), // Add color to the logs
    timestamp(), // Include timestamp
    printf(({ level, message, timestamp }) => {
        return `[${timestamp}] ${level}: ${message}`;
    })
);

// Create a logger instance
const logger = winston.createLogger({
    level: 'info', // Default log level
    format: logFormat,
    transports: [
        new winston.transports.Console() // Log to console
    ]
});

// Function to start the mining process
async function startMining() {
    const timestamp = new Date().toISOString();
    logger.info(`🚀 Starting the mining process...`);

    // Fetch pending transactions (mempool) if needed
    const pendingTransactions = await getPendingTransactions();

    if (pendingTransactions.length > 0) {
        logger.info(`💡 Mining block with ${pendingTransactions.length} pending transactions...`);
        await mineBlock(pendingTransactions);  // Mine with pending transactions
    } else {
        logger.info(`🛑 No pending transactions to mine. Mining an empty block with block reward...`);
        // If no pending transactions, mine with an empty block or a block reward
        await mineBlock([]);  // Mine with an empty block or just the block reward
    }

    logger.info(`✅ Mining process complete. Block successfully mined!`);
}

// Function to get pending transactions from the API
async function getPendingTransactions() {
    try {
        logger.info(`🔍 Fetching pending transactions...`);
        const response = await axios.get('http://localhost:3000/pending-transactions');  // Ensure the correct endpoint
        if (response.data && response.data.pendingTransactions) {
            logger.info(`📈 Found ${response.data.pendingTransactions.length} pending transactions.`);
            return response.data.pendingTransactions;  // Make sure the response contains the 'pendingTransactions' field
        } else {
            logger.error(`❌ No pending transactions found in the response.`);
            return [];  // Return an empty array if pending transactions are not found
        }
    } catch (error) {
        logger.error(`❌ Error fetching pending transactions: ${error.message}`);
        return [];  // Return an empty array if there's an error fetching transactions
    }
}

// Function to mine a new block and send it to the API
async function mineBlock(transactions) {
    logger.info(`⛏️ Requesting to mine a new block...`);

    try {
        if (transactions.length === 0) {
            transactions.push({
                Holly$: 512,
                Transmitter: "Coinbase",
                Target: minerAddress,
                BlockReward: true
            });
            logger.info(`🏅 Adding block reward transaction...`);
        }

        // Simulate the mining process (Proof of Work) with parallel threads
        const minedBlock = await mineProofOfWorkParallel(transactions);

        // Send mined block to API
        const blockData = {
            minerAddress,
            transactions: minedBlock.transactions,
            nonce: minedBlock.nonce,
            hash: minedBlock.hash
        };

        const response = await axios.post(API_URL_MINE, blockData);
        logger.info(`✅ Block mined and added to the blockchain. Block hash: ${response.data.blockHash}`);
    } catch (error) {
        logger.error(`❌ Error mining block: ${error.response?.data || error.message}`);
        logger.info(`⏳ Retrying mining...`);
        await retryMineBlock();
    }
}

// Simulate Proof of Work (PoW) with parallel mining
async function mineProofOfWorkParallel(transactions) {
    logger.info(`⛏️ Starting parallel Proof of Work (PoW)...`);

    const blockHeader = JSON.stringify({
        minerAddress,
        transactions,
        difficulty
    });

    const target = '0'.repeat(difficulty); // Example: difficulty 4 means the hash should start with "0000"

    // Create an array of mining tasks to perform in parallel
    const miningTasks = Array(parallelThreads).fill(0).map((_, index) => {
        return mineSingleTask(blockHeader, target, index);
    });

    // Wait for all mining tasks to complete
    const results = await Promise.all(miningTasks);

    // Return the first valid result (the one that meets the difficulty)
    const validResult = results.find(result => result.hash.substring(0, difficulty) === target);
    
    if (validResult) {
        logger.info(`✅ Block mined successfully with nonce: ${validResult.nonce}, hash: ${validResult.hash}`);
        return { transactions, nonce: validResult.nonce, hash: validResult.hash };
    } else {
        throw new Error('Failed to mine block after all parallel threads');
    }
}

// Single mining task for parallel processing
async function mineSingleTask(blockHeader, target, threadIndex) {
    let nonce = threadIndex * 1000000; // Distribute work across threads by starting from different nonce ranges
    let hash = '';
    
    // Mine the block by changing the nonce until the hash satisfies the difficulty
    do {
        nonce++;
        const blockData = blockHeader + nonce;
        hash = crypto.createHash('sha256').update(blockData).digest('hex');
    } while (hash.substring(0, target.length) !== target);

    return { nonce, hash };
}

// Retry logic if mining fails
async function retryMineBlock(retries = 3, delay = 12000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            logger.info(`🌀 Retrying mining, attempt #${attempt}...`);
            const response = await axios.post(API_URL_MINE, {
                minerAddress // Only include minerAddress in the request body
            });
            logger.info(`✅ Block successfully mined after ${attempt} attempts! Block hash: ${response.data.blockHash}`);
            return;
        } catch (error) {
            logger.error(`❌ Attempt ${attempt} failed: ${error.response?.data || error.message}`);
            if (attempt < retries) {
                logger.info(`⏳ Retrying in ${delay / 6000} seconds...`);
                await sleep(delay);
            } else {
                logger.info(`🚫 All retry attempts failed. Aborting mining process.`);
            }
        }
    }
}

// Sleep function to simulate delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Start mining continuously every 10 seconds
setInterval(startMining, 10000);
