import { initCockroachDB, checkCockroachHealth, storeCockroachMemory, recallCockroachMemory } from '../src/core/mindby_cockroach.js';

async function run() {
    console.log('Testing CockroachDB connection...');
    const initRes = await initCockroachDB();
    console.log('Init Response:', initRes);

    if (initRes.success) {
        console.log('\nTesting Store Memory...');
        const stored = await storeCockroachMemory('CockroachDB x AWS Hackathon Test Memory from ANT-CLI', undefined, ['test', 'hackathon']);
        console.log('Stored:', stored);

        console.log('\nTesting Recall Memory...');
        const recalled = await recallCockroachMemory([], 3);
        console.log('Recalled Memories:', recalled);

        console.log('\nTesting Health Check...');
        const health = await checkCockroachHealth();
        console.log('Health Status:', health);
    }
    process.exit(0);
}

run();
